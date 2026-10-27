/**
 * HTTP client for the Overleaf web API, driven the same way the browser does.
 *
 * Authentication is the session cookie the user copies out of their browser;
 * the CSRF token is scraped from the `/project` page the first time that cookie
 * is validated. Every mutating request carries `_csrf` in the body plus an
 * `X-Csrf-Token` header, and a redirect response means the cookie has expired.
 *
 * The client is deliberately free of host-module dependencies so it can be
 * exercised by the standalone mock-server test.
 *
 * @module dsh-overleaf/api
 */

import { createHash } from 'node:crypto';

/** Requests longer than this are almost certainly not a session cookie. */
const MAX_COOKIE_LENGTH = 8192;
/** Normal request timeout. */
const DEFAULT_TIMEOUT_MS = 30_000;
/** Zip downloads can be large; allow more. */
const DOWNLOAD_TIMEOUT_MS = 120_000;
/** Compile requests are queued server-side and can take a while. */
const COMPILE_TIMEOUT_MS = 180_000;

/** Thrown when the session cookie no longer works; the panel asks for a new one. */
export class CookieExpiredError extends Error {
  constructor(message) {
    super(message ?? 'Overleaf 登录已过期，请在「Overleaf」面板重新粘贴 Cookie。');
    this.name = 'CookieExpiredError';
  }
}

export class OverleafError extends Error {
  constructor(message, { status } = {}) {
    super(message);
    this.name = 'OverleafError';
    if (status !== undefined) this.status = status;
  }
}

/** Normalize a base URL: https by default, no trailing slash. */
export function normalizeBaseUrl(input) {
  const raw = String(input ?? '').trim();
  if (raw.length === 0) throw new OverleafError('请填写 Overleaf 服务器地址。');
  const withScheme = /^https?:\/\//iu.test(raw) ? raw : `https://${raw}`;
  let url;
  try { url = new URL(withScheme); } catch { throw new OverleafError(`无效的服务器地址：${raw}`); }
  if (url.username || url.password) throw new OverleafError('服务器地址不支持内嵌用户名密码。');
  return url.origin;
}

/** A user may paste the whole `Cookie:` header or a bare session value. */
export function normalizeCookieInput(input) {
  const raw = String(input ?? '').trim().replace(/^cookie\s*:\s*/iu, '').trim();
  if (raw.length === 0) throw new OverleafError('请粘贴浏览器中的 Overleaf Cookie。');
  if (raw.length > MAX_COOKIE_LENGTH) throw new OverleafError('Cookie 过长，请只粘贴请求头里的 Cookie 一行。');
  if (/[\r\n\0]/u.test(raw)) throw new OverleafError('Cookie 只能是一行，不能包含换行符。');
  return raw;
}

/** Join a Set-Cookie list into the running cookie string, first value wins. */
function mergeCookies(current, setCookieValues) {
  const jar = new Map();
  for (const header of current.split(';')) {
    const at = header.indexOf('=');
    if (at > 0) jar.set(header.slice(0, at).trim(), header.slice(at + 1).trim());
  }
  for (const header of setCookieValues ?? []) {
    const pair = header.split(';')[0];
    const at = pair.indexOf('=');
    if (at > 0) {
      const name = pair.slice(0, at).trim();
      // A cleared cookie (empty value) removes the entry.
      if (pair.slice(at + 1).trim() === '') jar.delete(name);
      else jar.set(name, pair.slice(at + 1).trim());
    }
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
}

/** Meta-tag scraper for the values Overleaf inlines in every project page. */
export function parseProjectPageMetas(html) {
  const meta = (name) => {
    const tags = html.match(/<meta\b[^>]*>/giu) ?? [];
    for (const tag of tags) {
      const named = /\bname\s*=\s*["']([^"']+)["']/iu.exec(tag);
      if (named === null || named[1].toLowerCase() !== name.toLowerCase()) continue;
      const content = /\bcontent\s*=\s*["']([^"']*)["']/iu.exec(tag);
      return content === null ? undefined : decodeEntities(content[1]);
    }
    return undefined;
  };
  return {
    userId: meta('ol-user_id'),
    csrfToken: meta('ol-csrfToken'),
    email: meta('ol-usersEmail'),
  };
}

function decodeEntities(text) {
  return text.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&#x27;', "'");
}

/** sha1 in git-blob form, the hash format Overleaf's docs use. */
export function blobHash(text) {
  return createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');
}

/** Strip a single shared top-level directory from zip entry paths, if present. */
export function stripCommonRoot(entries) {
  const names = [...entries.keys()];
  if (names.length === 0) return;
  const first = names[0].split('/')[0];
  if (names.length > 1 || first === '') {
    if (!names.every(name => name.startsWith(`${first}/`))) return;
  }
  const moved = new Map();
  for (const [name, data] of entries) moved.set(name.slice(first.length + 1), data);
  return moved;
}

/**
 * One client per server identity; cookies and the CSRF token live here.
 * @param options - base URL, cookie string, and optional overrides for tests.
 */
export class OverleafClient {
  constructor({ baseUrl, cookies, csrfToken, userId, email, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.cookies = cookies ?? '';
    this.csrfToken = csrfToken;
    this.userId = userId;
    this.email = email;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  get loggedIn() {
    return this.cookies.length > 0 && this.csrfToken !== undefined && this.userId !== undefined;
  }

  /** Record cookies the server (re)sets, e.g. the GCLB load-balancer cookie. */
  absorbCookies(response) {
    const set = response.headers.getSetCookie?.() ?? [];
    if (set.length > 0) this.cookies = mergeCookies(this.cookies, set);
  }

  /**
   * One HTTP request with the plugin's conventions: cookies always, JSON bodies
   * with `_csrf`, `X-Csrf-Token` on mutations, and 302 means "log in again".
   */
  async request(method, path, { query, body, rawBody, headers, timeoutMs, signal, redirect = 'manual', includeCookies = true } = {}) {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const mutating = method !== 'GET' && method !== 'HEAD';
    const timeout = AbortSignal.timeout(timeoutMs ?? this.timeoutMs);
    const response = await this.fetch(url, {
      method,
      redirect,
      signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
      headers: {
        ...(includeCookies && this.cookies.length > 0 ? { cookie: this.cookies } : {}),
        ...(mutating ? { 'x-csrf-token': this.csrfToken ?? '', origin: this.baseUrl } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: rawBody !== undefined ? rawBody
        : body === undefined ? undefined : JSON.stringify({ _csrf: this.csrfToken, ...body }),
    });
    this.absorbCookies(response);
    if (response.status >= 300 && response.status < 400) {
      throw new CookieExpiredError();
    }
    return response;
  }

  /** Validate a pasted cookie and fill in identity + CSRF from the project page. */
  async login(cookieInput) {
    this.cookies = normalizeCookieInput(cookieInput);
    const response = await this.request('GET', '/project');
    if (!response.ok && response.status !== 304) {
      throw new OverleafError(`无法打开项目页（HTTP ${response.status}），请检查 Cookie。`, { status: response.status });
    }
    const html = await response.text();
    const metas = parseProjectPageMetas(html);
    if (!metas.userId || !metas.csrfToken) {
      throw new OverleafError('Cookie 无效或已过期：页面里找不到用户身份，请重新从浏览器复制。');
    }
    this.userId = metas.userId;
    this.csrfToken = metas.csrfToken;
    this.email = metas.email;
    // The socket.io client script is a cheap request whose Set-Cookie carries the
    // load-balancer affinity the realtime connection will need.
    try {
      const script = await this.request('GET', '/socket.io/socket.io.js');
      await script.arrayBuffer();
    } catch { /* Load-balancer cookies are an optimization, not a requirement. */ }
    return this.identity();
  }

  identity() {
    return { baseUrl: this.baseUrl, userId: this.userId, email: this.email, csrfToken: this.csrfToken };
  }

  /** `POST /api/project`, falling back to the older `GET /user/projects`. */
  async listProjects() {
    try {
      const response = await this.request('POST', '/api/project', { body: {} });
      if (!response.ok) throw new OverleafError(`项目列表请求失败（HTTP ${response.status}）`, { status: response.status });
      const data = await response.json();
      return normalizeProjects(data.projects);
    } catch (error) {
      if (error instanceof CookieExpiredError) throw error;
      // Older servers only expose the dashboard JSON endpoint.
      const response = await this.request('GET', '/user/projects');
      if (!response.ok) {
        throw error instanceof OverleafError ? error : new OverleafError(`项目列表请求失败（HTTP ${response.status}）`, { status: response.status });
      }
      const data = await response.json();
      return normalizeProjects(data.projects);
    }
  }

  /** Download the whole project as a zip; returns `Map<name, Uint8Array>`. */
  async downloadZip(projectId, { signal } = {}) {
    const response = await this.request('GET', `/project/${encodeURIComponent(projectId)}/download/zip`,
      { timeoutMs: DOWNLOAD_TIMEOUT_MS, signal });
    if (!response.ok) {
      throw new OverleafError(`项目下载失败（HTTP ${response.status}）`, { status: response.status });
    }
    const { unzipSync } = await import('fflate');
    // unzipSync yields a plain {name: bytes} object; normalize to a Map.
    const entries = new Map(Object.entries(unzipSync(new Uint8Array(await response.arrayBuffer()))));
    return stripCommonRoot(entries) ?? entries;
  }

  /** The full project model including the entity tree with ids, via the realtime socket. */
  async fetchProjectTree(projectId, { signal } = {}) {
    const { fetchProjectTree: viaSocket } = await import('./realtime.js');
    return viaSocket({
      baseUrl: this.baseUrl, cookies: this.cookies, csrfToken: this.csrfToken,
      fetchImpl: this.fetch, signal,
    }, projectId);
  }

  /**
   * Compile and return the response with output file metadata.
   * @param mainFile - root resource path relative to the project root, e.g. `main.tex`.
   */
  async compile(projectId, mainFile, { signal } = {}) {
    const response = await this.request('POST', `/project/${encodeURIComponent(projectId)}/compile`, {
      query: { auto_compile: 'true' },
      body: { check: 'silent', draft: false, incrementalCompilesEnabled: true, stopOnFirstError: false, rootResourcePath: mainFile },
      timeoutMs: COMPILE_TIMEOUT_MS,
      signal,
    });
    if (!response.ok) {
      throw new OverleafError(`编译请求失败（HTTP ${response.status}）`, { status: response.status });
    }
    return response.json();
  }

  /**
   * Download one compile output (pdf/log/synctex). overleaf.com serves these from
   * a CDN host without cookies; self-hosted serves them from the app with cookies.
   */
  async downloadOutput(projectId, output, compile) {
    const query = {
      compileGroup: compile?.compileGroup,
      clsiserverid: compile?.clsiServerId,
    };
    if (compile?.pdfDownloadDomain && compile?.clsiServerId) {
      const response = await this.request('GET', new URL(output.url, compile.pdfDownloadDomain).toString(),
        { query: { ...query, enable_pdf_caching: 'true' }, timeoutMs: DOWNLOAD_TIMEOUT_MS, includeCookies: false });
      if (!response.ok) throw new OverleafError(`下载 ${output.path} 失败（HTTP ${response.status}）`, { status: response.status });
      return new Uint8Array(await response.arrayBuffer());
    }
    const url = new URL(output.url, this.baseUrl);
    url.pathname = output.url.startsWith('/') ? output.url : `/${output.url}`;
    const response = await this.request('GET', `${url.pathname}${url.search}`, { query, timeoutMs: DOWNLOAD_TIMEOUT_MS });
    if (!response.ok) throw new OverleafError(`下载 ${output.path} 失败（HTTP ${response.status}）`, { status: response.status });
    return new Uint8Array(await response.arrayBuffer());
  }

  /** Download one binary fileRef; servers may answer with 206 partial bodies. */
  async fetchFile(projectId, fileId, { signal } = {}) {
    const url = `/project/${encodeURIComponent(projectId)}/file/${encodeURIComponent(fileId)}`;
    const chunks = [];
    let nextByte = 0;
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const response = await this.request('GET', url, {
        timeoutMs: DOWNLOAD_TIMEOUT_MS, signal,
        headers: nextByte > 0 ? { range: `bytes=${nextByte}-` } : undefined,
      });
      if (!response.ok) {
        throw new OverleafError(`下载文件失败（HTTP ${response.status}）`, { status: response.status });
      }
      const chunk = new Uint8Array(await response.arrayBuffer());
      if (nextByte > 0 && response.status === 200) {
        // Some self-hosted versions ignore Range after the first partial
        // response and return the complete file. Do not append it twice.
        chunks.length = 0;
      }
      chunks.push(chunk);
      if (response.status !== 206) break;
      const range = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/iu.exec(response.headers.get('content-range') ?? '');
      if (range === null) break;
      if (Number(range[1]) !== nextByte) break;
      const end = Number(range[2]);
      const total = range[3] === '*' ? undefined : Number(range[3]);
      if (!Number.isSafeInteger(end) || (total !== undefined && end + 1 >= total)) break;
      nextByte = end + 1;
    }
    const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
    return result;
  }

  /** Rename a remote entity in place. */
  renameEntity(projectId, type, id, name) {
    return this.mutate('POST', `/project/${encodeURIComponent(projectId)}/${type}/${id}/rename`, { body: { name } });
  }

  /** Move a remote entity into another folder. */
  moveEntity(projectId, type, id, folderId) {
    return this.mutate('POST', `/project/${encodeURIComponent(projectId)}/${type}/${id}/move`,
      { body: { folder_id: folderId } });
  }

  /** Delete a remote entity. */
  deleteEntity(projectId, type, id) {
    return this.mutate('DELETE', `/project/${encodeURIComponent(projectId)}/${type}/${id}`);
  }

  /** Upload one file into a folder; Overleaf decides whether text becomes a doc. */
  async uploadFile(projectId, folderId, name, content, { mimeType } = {}) {
    const type = mimeType ?? guessMime(name);
    const buffer = typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content);
    const form = new FormData();
    form.set('name', name);
    form.set('type', type);
    form.set('_csrf', this.csrfToken ?? '');
    form.set('targetFolderId', folderId);
    form.set('qqfile', new Blob([buffer], { type }), name);
    const response = await this.request('POST', `/project/${encodeURIComponent(projectId)}/upload`, {
      query: {
        folder_id: folderId, _csrf: this.csrfToken, qquuid: crypto.randomUUID(),
        qqfilename: name, qqtotalfilesize: buffer.byteLength,
      },
      // The browser-style multipart body: fetch sets the boundary header itself.
      rawBody: form,
    });
    // fetch handles FormData natively; only set the cookie/csrf headers ourselves.
    if (!response.ok) {
      throw new OverleafError(`上传 ${name} 失败（HTTP ${response.status}）`, { status: response.status });
    }
    const data = await response.json().catch(() => ({}));
    if (data.success === false) {
      throw new OverleafError(`上传 ${name} 被拒绝：${data.error ?? '未知错误'}`);
    }
    return data;
  }

  /** Mutating request as raw multipart/JSON, used by the entity endpoints. */
  async mutate(method, path, { query, body } = {}) {
    const response = await this.request(method, path, { query, body });
    if (!response.ok && response.status !== 204) {
      let detail = '';
      try {
        const text = await response.text();
        detail = text.length > 0 && text.length < 300 ? `：${text}` : '';
      } catch { /* The status code is the useful part. */ }
      throw new OverleafError(`${method} ${path} 失败（HTTP ${response.status}）${detail}`, { status: response.status });
    }
    if (response.status === 204) return {};
    const text = await response.text();
    return text.length > 0 ? JSON.parse(text) : {};
  }
}

function guessMime(name) {
  if (/\.png$/iu.test(name)) return 'image/png';
  if (/\.jpe?g$/iu.test(name)) return 'image/jpeg';
  if (/\.gif$/iu.test(name)) return 'image/gif';
  if (/\.pdf$/iu.test(name)) return 'application/pdf';
  return 'application/octet-stream';
}

/** Accept both the new `{projects:[{id}]}` and the older `{_id}` spelling. */
function normalizeProjects(projects) {
  if (!Array.isArray(projects)) return [];
  return projects.map((project) => ({
    id: project.id ?? project._id,
    name: project.name ?? '未命名项目',
    lastUpdated: project.lastUpdated ?? null,
    accessLevel: project.accessLevel,
    archived: project.archived === true,
    trashed: project.trashed === true,
  })).filter(project => project.id !== undefined && !project.archived && !project.trashed);
}
