/**
 * Operational-transform helpers: turn two texts into Overleaf `op` components,
 * apply components, and merge a remote edit into a locally edited file.
 *
 * Overleaf text ops are `[{p, i?}, {p, d?}]`. Each `p` is a position in the
 * document *after* the previous components were applied: equal and inserted
 * text advance the cursor, deleted text does not. Applying the list in order to
 * the pre-op text reproduces the new text.
 *
 * Three-way merge follows the reference implementation: patches from
 * base -> remote are applied onto the local text with diff-match-patch's fuzzy
 * patch application. When even fuzzy application fails (the local file was
 * rewritten beyond recognition), we keep the local text and report a conflict
 * instead of silently discarding either side.
 *
 * @module dsh-overleaf/ot
 */

import DiffMatchPatch from 'diff-match-patch';

/** A fresh instance per call would allocate heavily; one shared editor is fine. */
const dmp = new DiffMatchPatch();
dmp.Diff_Timeout = 2;
dmp.Match_Threshold = 0.5;
dmp.Patch_DeleteThreshold = 0.5;

const EQUAL = 0;
const INSERT = 1;
const DELETE = -1;

/**
 * Convert the transformation `from -> to` into Overleaf op components.
 * @param from - the document before the edit.
 * @param to - the document after the edit.
 * @returns `{p, i}` / `{p, d}` components; empty when the texts are equal.
 */
export function textToOps(from, to) {
  if (from === to) return [];
  const diffs = dmp.diff_main(from, to);
  dmp.diff_cleanupSemantic(diffs);
  const ops = [];
  let position = 0;
  for (const [operation, text] of diffs) {
    if (operation === EQUAL) {
      position += text.length;
    } else if (operation === INSERT) {
      ops.push({ p: position, i: text });
      position += text.length;
    } else if (operation === DELETE) {
      ops.push({ p: position, d: text });
    }
  }
  return ops;
}

/**
 * Apply op components in order.
 * @param text - the pre-op document.
 * @param ops - the components, as sent to / received from Overleaf.
 * @returns the resulting document.
 */
export function applyOps(text, ops) {
  let result = text;
  for (const op of ops ?? []) {
    if (typeof op?.i === 'string') {
      result = result.slice(0, op.p) + op.i + result.slice(op.p);
    } else if (op?.d !== undefined) {
      const length = deleteLength(op.d);
      result = result.slice(0, op.p) + result.slice(op.p + length);
    }
  }
  return result;
}

/**
 * How many characters a delete component removes.
 *
 * Incoming components carry `d` as an ASCII-encoded UTF-8 byte string (the
 * reference implementation decodes it before measuring), while our own outgoing
 * components carry plain text. This covers both shapes.
 */
export function deleteLength(deleted) {
  if (typeof deleted === 'number') return deleted;
  if (typeof deleted !== 'string') return 0;
  // Only treat it as byte-string when it differs from its ASCII reading.
  if (/^[\x00-\x7F]*$/u.test(deleted)) return deleted.length;
  return Buffer.from(deleted, 'ascii').toString('utf8').length;
}

/**
 * Merge a remote edit into a local edit.
 *
 * @param base - the text both sides last agreed on.
 * @param ours - the current local text.
 * @param theirs - the current remote text.
 * @returns `{text, conflict}`; `conflict` means fuzzy application failed and
 *   the local text was kept.
 */
export function mergeTexts(base, ours, theirs) {
  if (ours === base) return { text: theirs, conflict: false };
  if (theirs === base) return { text: ours, conflict: false };
  if (ours === theirs) return { text: ours, conflict: false };
  const patches = dmp.patch_make(base, theirs);
  const [merged, applied] = dmp.patch_apply(patches, ours);
  if (!applied.every(Boolean)) return { text: ours, conflict: true };
  return { text: merged, conflict: false };
}

/** The number of characters in a JS string (UTF-16 code units), for hashes. */
export function textLength(text) {
  return text.length;
}
