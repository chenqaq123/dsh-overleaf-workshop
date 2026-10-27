/**
 * Cookie store for Overleaf servers.
 *
 * One entry per base URL holds the raw `Cookie` header value plus the identity
 * and CSRF token scraped from the `/project` page at login time. The file is
 * private to the current user (0600 in a 0700 directory) and rewritten
 * atomically, following the same conventions as the SSH plugin's password store.
 *
 * @module dsh-overleaf/secrets
 */

import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';

/** Validate a store key: an `https://origin` string. */
function assertOrigin(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) throw new Error('无效的服务器地址。');
  return value;
}

/**
 * A `secrets.json` reader and writer. Load failures warn but never throw, so a
 * corrupt store cannot stop the plugin from loading.
 */
export class SecretStore {
  constructor({ file, warn } = {}) {
    if (typeof file !== 'string' || !file.startsWith('/')) throw new Error('overleaf: secrets file must be an absolute path');
    this.file = file;
    this.warn = typeof warn === 'function' ? warn : () => {};
    /** @type {Map<string, object> | undefined} loaded lazily, then authoritative. */
    this.secrets = undefined;
  }

  load() {
    if (this.secrets !== undefined) return this.secrets;
    this.secrets = new Map();
    let text;
    try {
      text = readFileSync(this.file, 'utf8');
    } catch (error) {
      if (error?.code !== 'ENOENT') this.warn(`cannot read ${this.file}: ${error.message}`);
      return this.secrets;
    }
    this.tighten();
    try {
      const parsed = JSON.parse(text);
      for (const [origin, entry] of Object.entries(parsed?.servers ?? {})) {
        if (typeof entry?.cookies !== 'string' || entry.cookies.length === 0) continue;
        try { this.secrets.set(assertOrigin(origin), entry); } catch { /* Skip an unusable key. */ }
      }
    } catch (error) {
      this.warn(`ignoring malformed ${this.file}: ${error.message}`);
    }
    return this.secrets;
  }

  tighten() {
    try {
      if ((statSync(this.file).mode & 0o077) !== 0) {
        chmodSync(this.file, 0o600);
        this.warn(`${this.file} was readable by other users; permissions were tightened to 0600`);
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') this.warn(`cannot check permissions of ${this.file}: ${error.message}`);
    }
  }

  get(origin) {
    try { return this.load().get(assertOrigin(origin)); } catch { return undefined; }
  }

  has(origin) {
    return this.get(origin) !== undefined;
  }

  /** Every stored origin with non-secret summary fields for the panel. */
  list() {
    return [...this.load()].map(([origin, entry]) => ({
      origin,
      email: entry.email ?? '',
      loggedIn: typeof entry.cookies === 'string' && entry.cookies.length > 0,
      savedAt: entry.savedAt ?? null,
    }));
  }

  /** Store (or replace) one server's session and persist atomically. */
  set(origin, entry) {
    const key = assertOrigin(origin);
    const previous = this.get(key);
    this.load().set(key, { ...previous, ...entry, savedAt: new Date().toISOString() });
    this.save();
  }

  /** Forget one server's session. Returns whether something was removed. */
  delete(origin) {
    let removed = false;
    try { removed = this.load().delete(assertOrigin(origin)); } catch { return false; }
    if (removed) this.save();
    return removed;
  }

  save() {
    const body = { version: 1, servers: Object.fromEntries(this.load()) };
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    const temp = `${this.file}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temp, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
      renameSync(temp, this.file);
    } finally { rmSync(temp, { force: true }); }
  }
}
