/**
 * CodeMirror 6 runtime for the vendored editor chunk.
 *
 * The source is bundled by scripts/build-editor.mjs because the Harness
 * module loader consumes one self-contained browser chunk. Keep the exported
 * adapter small: the React client only depends on create() and the returned
 * editor handle, so the editor engine can evolve without changing the UI.
 */

import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab, toggleComment } from '@codemirror/commands';
import {
  HighlightStyle, StreamLanguage, bracketMatching, foldCode, foldGutter, foldKeymap,
  foldService, indentOnInput, syntaxHighlighting, unfoldAll,
} from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { Compartment, EditorSelection, EditorState } from '@codemirror/state';
import {
  EditorView, drawSelection, highlightActiveLine, highlightSpecialChars, keymap, lineNumbers,
} from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

function withoutLatexComment(line) {
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line.charAt(index);
    if (character === '%' && !escaped) return line.slice(0, index);
    if (character === '\\' && !escaped) escaped = true;
    else escaped = false;
  }
  return line;
}

function headingLevel(line) {
  const match = withoutLatexComment(line).match(/\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?/);
  if (!match) return -1;
  return { part: 0, chapter: 1, section: 2, subsection: 3,
    subsubsection: 4, paragraph: 5, subparagraph: 6 }[match[1]];
}

function escapedRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Fold LaTeX environments and section subtrees without a full AST parser. */
function latexFold(state, lineStart, lineEnd) {
  const first = state.doc.lineAt(lineStart);
  const source = withoutLatexComment(first.text);
  const begin = /\\begin\s*\{([^}]+)\}/.exec(source);
  const lastLine = state.doc.lineAt(lineEnd).number;
  if (begin && source.indexOf('\\end') === -1) {
    const environment = escapedRegExp(begin[1]);
    let depth = 1;
    for (let number = first.number + 1; number <= lastLine; number += 1) {
      const current = withoutLatexComment(state.doc.line(number).text);
      const opens = current.match(new RegExp(`\\\\begin\\s*\\{${environment}\\}`, 'g'));
      const closes = current.match(new RegExp(`\\\\end\\s*\\{${environment}\\}`, 'g'));
      if (opens) depth += opens.length;
      if (closes) depth -= closes.length;
      if (depth === 0) return { from: first.to, to: state.doc.line(number).to };
    }
  }
  const level = headingLevel(source);
  if (level >= 0) {
    let end = state.doc.lines;
    for (let number = first.number + 1; number <= state.doc.lines; number += 1) {
      const nextLevel = headingLevel(state.doc.line(number).text);
      if (nextLevel >= 0 && nextLevel <= level) { end = number - 1; break; }
    }
    if (end > first.number) return { from: first.to, to: state.doc.line(end).to };
  }
  return null;
}

const latexLanguage = StreamLanguage.define(stex);
const latexFoldExtension = foldService.of(latexFold);

/**
 * Token spans get semantic classes; the colors live in the client CSS so they
 * follow the Harness palette variables (and its light/dark themes) instead of
 * a hardcoded editor scheme.
 */
const latexHighlight = HighlightStyle.define([
  { tag: t.comment, class: 'cm-ol-comment' },
  { tag: t.keyword, class: 'cm-ol-keyword' },
  { tag: t.tagName, class: 'cm-ol-tag' },
  { tag: [t.atom, t.string], class: 'cm-ol-string' },
  { tag: [t.number, t.bool], class: 'cm-ol-number' },
  { tag: t.standard(t.variableName), class: 'cm-ol-builtin' },
  { tag: t.invalid, class: 'cm-ol-invalid' },
]);

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'transparent',
    color: 'var(--dsw-alias-label-primary, CanvasText)',
    fontFamily: 'var(--ds-font-family-code, ui-monospace, SFMono-Regular, monospace)',
    fontSize: 'var(--dsh-content-font-size, var(--dsh-code-font-size, 12px))',
  },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'inherit', lineHeight: 'calc(22px + var(--dsh-content-font-delta, 0px))' },
  '.cm-content': { minHeight: '100%', padding: '6px 12px 14px', caretColor: 'currentColor' },
  '.cm-line': { fontFamily: 'inherit', fontSize: 'inherit' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'color-mix(in srgb, currentColor 38%, transparent)', border: '0' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 4px' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, currentColor 5%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'color-mix(in srgb, currentColor 5%, transparent)' },
  '.cm-selectionBackground, ::selection': { backgroundColor: 'color-mix(in srgb, var(--dsw-alias-link, #89B4FA) 24%, transparent)' },
  '.cm-matchingBracket': { color: 'var(--dsw-alias-link, #89B4FA) !important', borderBottom: '1px solid var(--dsw-alias-link, #89B4FA)' },
  '.cm-tooltip-autocomplete': { zIndex: '30', backgroundColor: 'Canvas', color: 'CanvasText' },
  '.cm-foldGutter': { width: '14px' },
}, { dark: false });

function completionAdapter(provider, view) {
  if (typeof provider !== 'function') return null;
  const state = view.state;
  const cursor = state.selection.main.head;
  const line = state.doc.lineAt(cursor);
  const cmLike = {
    getCursor: () => ({ line: line.number - 1, ch: cursor - line.from }),
    getLine: (number) => state.doc.line(number + 1).text,
    getValue: () => state.doc.toString(),
  };
  const result = provider(cmLike);
  if (!result?.list?.length) return null;
  const position = (value) => state.doc.line(value.line + 1).from + value.ch;
  return {
    from: position(result.from),
    to: position(result.to),
    options: result.list.map((item) => typeof item === 'string' ? { label: item } : {
      label: item.text ?? item.label ?? '', displayLabel: item.displayText ?? item.displayLabel,
    }),
    validFor: /^[\\\w./*?-]*$/,
  };
}

function create(host, options = {}) {
  host.textContent = '';
  let suppress = false;
  let completionProvider = typeof options.getCompletions === 'function' ? options.getCompletions : null;
  const readOnly = new Compartment();
  const initial = typeof options.value === 'string' ? options.value : '';
  const save = typeof options.onSave === 'function' ? options.onSave : () => {};
  const change = typeof options.onChange === 'function' ? options.onChange : () => {};
  let view;
  const completionSource = () => (context) => completionAdapter(completionProvider, view);
  view = new EditorView({
    state: EditorState.create({
      doc: initial,
      extensions: [
        editorTheme,
        latexLanguage,
        latexFoldExtension,
        lineNumbers(),
        EditorView.lineWrapping,
        foldGutter(),
        history(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        drawSelection(),
        highlightActiveLine(),
        highlightSpecialChars(),
        EditorView.contentAttributes.of({ spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' }),
        syntaxHighlighting(latexHighlight),
        highlightSelectionMatches(),
        EditorState.phrases.of({
          Find: '查找', Replace: '替换', next: '下一个', previous: '上一个', all: '全选',
          'match case': '区分大小写', regexp: '正则', 'by word': '全词匹配',
          replace: '替换', 'replace all': '全部替换', close: '关闭',
        }),
        search({ top: true }),
        autocompletion({ override: [completionSource()], defaultKeymap: false, closeOnBlur: true }),
        readOnly.of(options.readOnly === true ? EditorState.readOnly.of(true) : []),
        keymap.of([
          { key: 'Mod-s', run: () => { save(); return true; } },
          { key: 'Mod-/', run: toggleComment },
          { key: 'Alt-[', run: foldCode },
          { key: 'Alt-]', run: unfoldAll },
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
          ...closeBracketsKeymap,
          ...completionKeymap,
          ...foldKeymap,
          ...searchKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !suppress) change(update.state.doc.toString());
        }),
      ],
    }),
    parent: host,
  });

  function setValue(text) {
    if (typeof text !== 'string' || view.state.doc.toString() === text) return;
    const anchor = Math.min(view.state.selection.main.head, text.length);
    const scrollTop = view.scrollDOM.scrollTop;
    const scrollLeft = view.scrollDOM.scrollLeft;
    suppress = true;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text },
      selection: EditorSelection.single(anchor) });
    suppress = false;
    view.scrollDOM.scrollTop = scrollTop;
    view.scrollDOM.scrollLeft = scrollLeft;
  }

  function revealLine(line) {
    if (!Number.isFinite(line) || line <= 0) return;
    const target = view.state.doc.line(Math.min(Math.max(1, line), view.state.doc.lines));
    view.dispatch({ selection: EditorSelection.range(target.from, target.to),
      effects: EditorView.scrollIntoView(target.from, { y: 'center' }) });
    view.focus();
  }

  return {
    getValue: () => view.state.doc.toString(),
    setValue,
    setReadOnly(value) {
      view.dispatch({ effects: readOnly.reconfigure(value === true ? EditorState.readOnly.of(true) : []) });
    },
    setCompletions(provider) { completionProvider = typeof provider === 'function' ? provider : null; },
    revealLine,
    focus: () => view.focus(),
    hasFocus: () => view.hasFocus,
    refresh: () => view.requestMeasure(),
    destroy: () => view.destroy(),
  };
}

globalThis.__dshOverleafCodeMirror = { create, version: '6' };
