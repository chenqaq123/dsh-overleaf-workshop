/**
 * Classic-script runtime for the vendored CodeMirror 5 chunk.
 *
 * This file is concatenated after CodeMirror and its addons by
 * scripts/build-editor.mjs. It must stay ES5-ish and must not be a module:
 * the chunk is loaded as a classic script by the client module loader.
 */
(function () {
  var CM = window.CodeMirror;
  if (typeof CM !== 'function') throw new Error('CodeMirror did not load');

  function clampLine(cm, line) {
    var last = Math.max(0, cm.lineCount() - 1);
    return Math.min(Math.max(0, line - 1), last);
  }

  /**
   * Render everything for ordinary LaTeX files: CodeMirror's viewport trimming
   * swaps DOM nodes while scrolling, which shows up as stutter on a trackpad.
   * Very large files keep a viewport so opening them stays cheap.
   */
  function viewportFor(text) {
    return text.split('\n').length > 1500 ? 20 : Infinity;
  }

  /**
   * Create an editor in `host`.
   * @param {HTMLElement} host
   * @param {object} options
   */
  function create(host, options) {
    options = options || {};
    host.textContent = '';
    var suppress = false;
    var initial = typeof options.value === 'string' ? options.value : '';
    var save = typeof options.onSave === 'function' ? options.onSave : function () {};
    var change = typeof options.onChange === 'function' ? options.onChange : function () {};
    function onChange() {
      if (!suppress) change(cm.getValue());
    }

    var cm = CM(host, {
      value: initial,
      mode: options.mode || 'text/x-stex',
      lineNumbers: true,
      lineWrapping: true,
      viewportMargin: viewportFor(initial),
      matchBrackets: true,
      autoCloseBrackets: true,
      styleActiveLine: true,
      indentUnit: 2,
      tabSize: 2,
      indentWithTabs: false,
      electricChars: true,
      readOnly: options.readOnly === true ? 'nocursor' : false,
      scrollbarStyle: 'native',
      extraKeys: {
        'Cmd-S': save,
        'Ctrl-S': save,
        'Cmd-F': 'findPersistent',
        'Ctrl-F': 'findPersistent',
        'Cmd-G': 'findNext',
        'Ctrl-G': 'findNext',
        'Shift-Cmd-G': 'findPrev',
        'Shift-Ctrl-G': 'findPrev',
        'Cmd-/': 'toggleComment',
        'Ctrl-/': 'toggleComment',
        'Tab': 'indentMore',
        'Shift-Tab': 'indentLess',
      },
    });

    cm.on('change', onChange);

    function setValue(text) {
      if (typeof text !== 'string' || cm.getValue() === text) return;
      var cursor = cm.getCursor();
      var scroll = cm.getScrollInfo();
      suppress = true;
      cm.setValue(text);
      suppress = false;
      cm.setOption('viewportMargin', viewportFor(text));
      cm.setCursor(Math.min(cursor.line, Math.max(0, cm.lineCount() - 1)),
        Math.min(cursor.ch, cm.getLine(Math.min(cursor.line, Math.max(0, cm.lineCount() - 1))).length));
      cm.scrollTo(scroll.left, scroll.top);
    }

    function revealLine(line) {
      if (typeof line !== 'number' || !isFinite(line) || line <= 0) return;
      var target = clampLine(cm, line);
      var text = cm.getLine(target) || '';
      cm.setSelection({ line: target, ch: 0 }, { line: target, ch: text.length });
      cm.scrollIntoView({ line: target, ch: 0 }, 60);
      cm.focus();
    }

    function refresh() {
      var wrapper = cm.getWrapperElement();
      if (!wrapper || !wrapper.isConnected) return;
      if (wrapper.clientWidth === 0 || wrapper.clientHeight === 0) return;
      cm.refresh();
    }

    function setReadOnly(readOnly) {
      cm.setOption('readOnly', readOnly ? 'nocursor' : false);
    }

    function destroy() {
      cm.off('change', onChange);
      var wrapper = cm.getWrapperElement();
      var input = wrapper && wrapper.querySelector('textarea');
      if (input) input.blur();
      if (wrapper && wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
      host.textContent = '';
    }

    return {
      getValue: function () { return cm.getValue(); },
      setValue: setValue,
      setReadOnly: setReadOnly,
      revealLine: revealLine,
      focus: function () { cm.focus(); },
      hasFocus: function () {
        var wrapper = cm.getWrapperElement();
        return cm.hasFocus() || (wrapper != null && wrapper.contains(document.activeElement));
      },
      refresh: refresh,
      destroy: destroy,
    };
  }

  window.__dshOverleafCodeMirror = { create: create, version: CM.version };
})();
