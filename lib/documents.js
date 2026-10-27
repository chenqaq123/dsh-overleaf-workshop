/**
 * State machine for one Overleaf document: version, the last known server text,
 * and the text the local file had when the two were last reconciled.
 *
 * Two directions:
 * - `receive(update)` handles a server `otUpdateApplied` event (including the
 *   op-less echo that acknowledges our own write).
 * - `planWrite(localText)` decides what to do with the file on disk: nothing,
 *   adopt the remote text, or send op components — merged with any remote edit
 *   that landed since the file was last touched.
 *
 * Version rules (from the protocol):
 * - remote updates carry `v` equal to the version they apply to, then bump it;
 * - our own writes are acknowledged by an update with no `op`, which also bumps
 *   the version;
 * - anything else means we lost track and must re-join the document.
 *
 * @module dsh-overleaf/documents
 */

import { applyOps, mergeTexts, textToOps } from './ot.js';

/** Decode the per-line latin1-packed UTF-8 strings returned by `joinDoc`. */
export function decodeJoinLines(lines) {
  if (!Array.isArray(lines)) return '';
  return lines.map((line) => Buffer.from(String(line), 'latin1').toString('utf8')).join('\n');
}

/**
 * Read a `joinDoc` acknowledgement.
 *
 * Overleaf answers `[null, lines, version, ...]`; older test doubles and some
 * deployments put the lines first. Treating the real shape as `[lines, version]`
 * yields an empty document, which would then overwrite the local source file.
 * Refuse an acknowledgement that has neither shape instead.
 * @param ack - the raw acknowledgement array.
 * @returns the line array and numeric version.
 */
export function parseJoinAck(ack) {
  if (!Array.isArray(ack)) throw new Error('joinDoc 返回格式异常');
  const at = Array.isArray(ack[0]) ? 0 : Array.isArray(ack[1]) ? 1 : -1;
  const version = at === -1 ? undefined : Number(ack[at + 1]);
  if (at === -1 || !Number.isFinite(version)) throw new Error('joinDoc 返回格式异常');
  return { lines: ack[at], version };
}

/** What `receive()` did, so the caller knows whether to write a file or re-join. */
export const ReceiveResult = {
  /** Our own write was acknowledged; the version moved forward. */
  ACK: 'ack',
  /** A remote edit was applied; the caller should reconcile the file. */
  APPLIED: 'applied',
  /** An already-applied update arrived again; nothing to do. */
  STALE: 'stale',
  /** We missed updates; the caller must re-join this document. */
  REJOIN: 'rejoin',
};

export class DocumentModel {
  /**
   * @param options - the entity id and project-relative path.
   */
  constructor({ docId, path }) {
    this.docId = docId;
    this.path = path;
    /** Last known server-side version. */
    this.version = -1;
    /** Server text including our own writes that have not been acknowledged yet. */
    this.remoteText = '';
    /** Disk text at the last reconciliation; the merge base. */
    this.baseText = '';
    /** Set when the base is no longer trustworthy and the doc must be re-joined. */
    this.needsRejoin = false;
    this.joined = false;
    /** Set while our own `applyOtUpdate` awaits its echo. */
    this.inFlight = false;
    this.lastHashAt = 0;
  }

  /** Seed from a `joinDoc` ack. */
  join(lines, version) {
    this.remoteText = decodeJoinLines(lines);
    this.baseText = this.remoteText;
    this.version = Number(version ?? 0);
    this.joined = true;
    this.inFlight = false;
  }

  /**
   * Handle a server update.
   * @param update - `{doc, v, op?, meta?}` from `otUpdateApplied`.
   * @returns one of {@link ReceiveResult}.
   */
  receive(update) {
    const version = Number(update?.v);
    const hasOp = Array.isArray(update?.op) && update.op.length > 0;
    if (!Number.isFinite(version)) return ReceiveResult.REJOIN;
    if (!hasOp) {
      // Our own write echoed back without an op: it is now part of the version.
      if (version >= this.version) this.version = version + 1;
      this.inFlight = false;
      return ReceiveResult.ACK;
    }
    if (version < this.version) return ReceiveResult.STALE;
    if (version > this.version) return ReceiveResult.REJOIN;
    this.remoteText = applyOps(this.remoteText, update.op);
    this.version = version + 1;
    return ReceiveResult.APPLIED;
  }

  /**
   * Reconcile the text currently on disk with the server text.
   * @param localText - the file content.
   * @returns `{text, write, send, conflict, update?}`:
   *   `text` is what the file should contain, `write` says whether to write it,
   *   `send` says whether `text` differs from the server and must be pushed, and
   *   `update` is the ready-to-send `applyOtUpdate` envelope in that case.
   */
  planWrite(localText) {
    const before = this.remoteText;
    if (localText === this.remoteText) {
      this.baseText = localText;
      return { text: localText, write: false, send: false, conflict: false };
    }
    if (localText === this.baseText) {
      // The file is untouched since the last sync: the remote wins.
      this.baseText = this.remoteText;
      return { text: this.remoteText, write: true, send: false, conflict: false };
    }
    if (typeof this.baseText !== 'string' || typeof this.remoteText !== 'string' || this.needsRejoin) {
      // A failed push invalidates the merge base, so the next join treats the
      // disk text as a fresh local edit. If that join also failed we reach here
      // without a base: keep the file and ask the caller to re-join instead of
      // merging against a missing base (which throws in diff-match-patch) or
      // pushing against a stale one.
      return { text: localText, write: false, send: false, conflict: true, rejoin: true };
    }
    const { text, conflict } = mergeTexts(this.baseText, localText, this.remoteText);
    this.baseText = text;
    if (text === this.remoteText) {
      return { text, write: text !== localText, send: false, conflict };
    }
    // Optimistically treat our merged text as the server text until the echo
    // arrives, so consecutive local edits diff against the right base.
    const op = textToOps(before, text);
    this.remoteText = text;
    return { text, write: text !== localText, send: true, conflict,
      update: { doc: this.docId, v: this.version, lastV: this.version - 1, op } };
  }

  /** The op components that carry `from -> to`, plus the update envelope. */
  buildUpdate(from, to, { hash } = {}) {
    const op = textToOps(from, to);
    if (op.length === 0) return undefined;
    const update = { doc: this.docId, v: this.version, lastV: this.version - 1, op };
    if (typeof hash === 'string') update.hash = hash;
    return update;
  }

  /** Record that a write was accepted on the wire. */
  markWritten(text) {
    this.baseText = text;
    this.remoteText = text;
    this.inFlight = true;
  }

  /** Drop local tracking after a failed or timed-out write. */
  resetForRejoin() {
    this.joined = false;
    this.inFlight = false;
  }
}
