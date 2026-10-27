/* Native Harness client bundle. React and services come from its module loader. */
window.__ModuleLoader__.load({
  id: 'dsh-overleaf',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useCallback, useRef } = React;
    const PANEL = 'overleaf';
    const POLL_MS = 1500;

    const CSS = `
      .dsh-ol-page{height:100%;overflow:auto;box-sizing:border-box;padding:calc(var(--dsh-frame-top-clearance,24px) + 24px) 36px 48px;color:inherit;font-family:inherit}
      .dsh-ol-inner{max-width:1000px;margin:0 auto}.dsh-ol-page *{box-sizing:border-box}
      .dsh-ol-header{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:24px}
      .dsh-ol-page h1{font-size:26px;letter-spacing:-.5px;margin:0 0 8px;font-weight:650}
      .dsh-ol-muted{opacity:.62;font-size:13px;line-height:1.65;margin:0}
      .dsh-ol-card{border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:14px;padding:24px;margin-bottom:24px;background:color-mix(in srgb,currentColor 2%,transparent)}
      .dsh-ol-card h2{font-size:15px;font-weight:650;margin:0 0 18px}
      .dsh-ol-field{display:flex;flex-direction:column;gap:8px;font-size:13px;font-weight:550;margin-bottom:14px}
      .dsh-ol-page input,.dsh-ol-page textarea{width:100%;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:8px;background:Canvas;color:CanvasText;padding:0 12px;font:inherit;outline:none;min-width:0;box-sizing:border-box}
      .dsh-ol-page textarea{height:84px;padding:10px 12px;font-family:ui-monospace,SFMono-Regular,monospace;font-size:12px;resize:vertical}
      .dsh-ol-page input{height:42px}
      .dsh-ol-page input:focus,.dsh-ol-page textarea:focus{border-color:#5684ec;box-shadow:0 0 0 3px #5684ec22}
      .dsh-ol-page button{font:inherit;cursor:pointer;border-radius:8px;min-height:36px;padding:8px 13px;border:1px solid color-mix(in srgb,currentColor 15%,transparent);color:inherit;background:transparent;white-space:nowrap;font-size:13px}
      .dsh-ol-page button:hover:not(:disabled){background:color-mix(in srgb,currentColor 6%,transparent)}
      .dsh-ol-page button:disabled{opacity:.45;cursor:default}
      .dsh-ol-primary{color:#fff;background:#138a59;border-color:#138a59}
      .dsh-ol-primary:hover:not(:disabled){background:#0f7449}
      .dsh-ol-danger{color:#c34c4c;border-color:#c34c4c55}
      .dsh-ol-error{color:#c34c4c;background:#c34c4c0d;border:1px solid #c34c4c33;border-radius:9px;padding:12px 14px;margin:0 0 16px;font-size:13px;line-height:1.6;overflow-wrap:anywhere}
      .dsh-ol-ok{font-size:13px;padding:12px 14px;background:#2381550d;border:1px solid #23815533;border-radius:9px;margin-bottom:16px}
      .dsh-ol-rows{display:flex;flex-direction:column;gap:10px}
      .dsh-ol-row{border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:12px;padding:16px 20px}
      .dsh-ol-row-head{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
      .dsh-ol-title{font-weight:600;font-size:14px;min-width:0;overflow-wrap:anywhere}
      .dsh-ol-sub{font-family:ui-monospace,SFMono-Regular,monospace;font-size:12px;opacity:.72;overflow-wrap:anywhere;margin-top:6px}
      .dsh-ol-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .dsh-ol-sessions{display:flex;flex-direction:column;gap:3px;margin-top:12px;padding-top:10px;border-top:1px solid color-mix(in srgb,currentColor 10%,transparent);max-height:190px;overflow:auto}
      .dsh-ol-session{display:flex;align-items:center;gap:10px;width:100%;border:0;background:none;color:inherit;font:inherit;text-align:left;padding:7px 9px;border-radius:7px;cursor:pointer;font-size:13px;min-width:0}
      .dsh-ol-session:hover{background:color-mix(in srgb,currentColor 6%,transparent)}
      .dsh-ol-session.current{background:#5684ec1a}
      .dsh-ol-session-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dsh-ol-session-time{font-size:11px;opacity:.5;flex:none}
      .dsh-ol-session-empty{font-size:12px;opacity:.55;padding:6px 9px}
      .dsh-ol-empty{text-align:center;padding:36px 20px;border:1px dashed color-mix(in srgb,currentColor 18%,transparent);border-radius:12px;font-size:14px}
      .dsh-ol-errlist{margin:8px 0 0;padding-left:18px;font-size:12.5px;line-height:1.7}
      .dsh-ol-errlist code{font-family:ui-monospace,SFMono-Regular,monospace;cursor:pointer}
      .dsh-ol-chip{display:inline-flex;align-items:center;gap:6px;font-size:11px;border-radius:20px;padding:3px 9px;background:color-mix(in srgb,currentColor 7%,transparent)}
      .dsh-ol-chip .dot{width:6px;height:6px;border-radius:50%;background:#9aa0a6}
      .dsh-ol-chip.connected .dot{background:#2fbf71}.dsh-ol-chip.error .dot{background:#c34c4c}
      .dsh-ol-chip.reconnecting .dot{background:#e0a100}
      .dsh-ol-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}
      .dsh-ol-editor{display:grid;grid-template-columns:230px 1fr;gap:14px;min-height:520px}
      .dsh-ol-files{border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:10px;padding:8px;overflow:auto;max-height:620px}
      .dsh-ol-file{display:flex;align-items:center;gap:6px;width:100%;border:0;text-align:left;padding:6px 8px;min-height:28px;font-size:12.5px;font-family:ui-monospace,SFMono-Regular,monospace;border-radius:6px;overflow:hidden;text-overflow:ellipsis}
      .dsh-ol-file.active{background:#5684ec22}
      .dsh-ol-file.folder{opacity:.75;font-weight:600;cursor:default}
      .dsh-ol-code-wrap{display:flex;flex-direction:column;min-width:0}
      .dsh-ol-codebar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;font-size:12px}
      .dsh-ol-code-name{font-family:ui-monospace,SFMono-Regular,monospace;opacity:.8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dsh-ol-code{flex:1;min-height:480px;height:60vh;padding:12px;font-family:ui-monospace,SFMono-Regular,monospace;font-size:12.5px;line-height:1.55;white-space:pre;overflow:auto;resize:vertical;tab-size:2}
      .dsh-ol-dirty{color:#e0a100;font-size:11px}
      @media(max-width:760px){.dsh-ol-editor{grid-template-columns:1fr}.dsh-ol-page{padding-left:18px;padding-right:18px}}
    `;

    /**
     * Overleaf workspaces put the editable sources and PDF on the left, next to
     * the project list, and leave the conversation on the far right. The harness
     * frame is a three-column grid; this swaps its two content tracks without
     * touching its React tree or the panel-width preferences.
     */
    const LAYOUT_CSS = `
      .dsh-ol-flipped[style]{grid-template-columns:var(--dsh-ol-flipped-columns)!important}
      .dsh-ol-flipped>[class*="sidebarCol"]{grid-column:1!important;grid-row:1!important}
      .dsh-ol-flipped>[class*="rightbarCol"]{grid-column:2!important;grid-row:1!important}
      .dsh-ol-flipped>[class*="centerCol"]{grid-column:3!important;grid-row:1!important}
      .dsh-ol-flipped>[class*="rightbarCol"] [data-sidebar-right-panel][data-sidebar-right-open="true"]{width:100%!important;--dsh-sidebar-width:100%!important}
      .dsh-ol-flipped>[class*="handle"][data-side="rightbar"]{display:none!important}
      .dsh-ol-flip-handle{display:none;position:absolute;top:0;bottom:0;width:8px;margin-left:-4px;cursor:col-resize;touch-action:none;z-index:12}
    `;

    /** The sidebar region: same DOM-section technique as dsh-remote-ssh. */
    const SIDEBAR_CSS = `
      .dsh-ol-sb{flex:none;display:flex;flex-direction:column;min-height:0;max-height:46%;margin-top:6px;padding-top:4px;border-top:1px solid color-mix(in srgb,currentColor 10%,transparent)}
      .dsh-ol-native-hidden{display:none!important}
      .dsh-ol-sb-head{display:flex;align-items:center;gap:6px;padding:6px;border:0;background:none;color:inherit;font:inherit;font-size:12px;font-weight:600;text-align:left;cursor:pointer;opacity:.82;border-radius:6px}
      .dsh-ol-sb-head:hover{background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,currentColor 7%,transparent))}
      .dsh-ol-sb-manage{margin-left:auto;font-size:11px;font-weight:400;opacity:.55;border:0;background:none;color:inherit;cursor:pointer;padding:2px 4px;border-radius:4px}
      .dsh-ol-sb-manage:hover{opacity:1;background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,currentColor 7%,transparent))}
      .dsh-ol-sb-body{overflow:auto;min-height:0;padding:2px 0 6px}
      .dsh-ol-sb-row{display:flex;flex-direction:column;gap:2px;width:100%;border:0;background:none;color:inherit;font:inherit;text-align:left;padding:5px 6px;border-radius:6px;cursor:pointer;min-height:26px;min-width:0}
      .dsh-ol-sb-row:hover{background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,currentColor 7%,transparent))}
      .dsh-ol-sb-main{display:flex;align-items:flex-start;gap:7px;min-width:0}
      .dsh-ol-sb-actions{display:flex;gap:2px;margin-left:13px;flex-wrap:wrap;opacity:.55}
      .dsh-ol-sb-row:hover .dsh-ol-sb-actions,.dsh-ol-sb-row:focus-within .dsh-ol-sb-actions{opacity:1}
      .dsh-ol-sb-act{border:0;background:none;color:inherit;font:inherit;font-size:10.5px;line-height:1.4;opacity:.6;padding:2px 5px;border-radius:4px;cursor:pointer;white-space:nowrap}
      .dsh-ol-sb-act:hover:not(:disabled){opacity:1;background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,currentColor 7%,transparent))}
      .dsh-ol-sb-act:disabled{opacity:.3;cursor:default}
      .dsh-ol-sb-act.end{color:#e56767}
      .dsh-ol-sb-note{font-size:11px;line-height:1.5;margin:2px 6px 6px;padding:5px 7px;border-radius:6px;overflow-wrap:anywhere}
      .dsh-ol-sb-note.ok{color:#238155;background:#23815510;border:1px solid #23815533}
      .dsh-ol-sb-note.error{color:#c34c4c;background:#c34c4c12;border:1px solid #c34c4c33}
      .dsh-ol-sb-note.warn{color:#a97400;background:#e0a10012;border:1px solid #e0a10033}
      .dsh-ol-sb-dot{width:6px;height:6px;border-radius:50%;flex:none;margin-top:6px;background:#8a8f98}
      .dsh-ol-sb-dot.connected{background:#86efac}.dsh-ol-sb-dot.reconnecting{background:#e2b93b}
      .dsh-ol-sb-dot.error{background:#e56767}
      .dsh-ol-sb-text{display:flex;flex-direction:column;min-width:0;gap:1px}
      .dsh-ol-sb-title{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dsh-ol-sb-sub{font-size:11px;opacity:.55;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dsh-ol-sb-chev{flex:none;width:18px;text-align:center;opacity:.5;transition:transform .12s;display:inline-block}
      .dsh-ol-sb-chev.open{transform:rotate(90deg)}
      .dsh-ol-sb-empty{font-size:12px;opacity:.55;padding:8px;line-height:1.6}
      .dsh-ol-sb-empty button{border:0;background:none;color:inherit;font:inherit;text-decoration:underline;cursor:pointer;padding:0;opacity:.9}
    `;

    const phaseLabel = { idle: '未启动', connecting: '连接中', connected: '实时同步中',
      reconnecting: '重连中', stopped: '已停止', error: '出错' };
    const errorText = (error) => String(error?.message ?? error);

    /**
     * Why the optional right-Sidebar wiring did not register. Displayed in the
     * panel and the sidebar section, because a failed `apply` would remove the
     * plugin's whole UI and leave nothing to read.
     */
    let setupError = '';
    function noteSetupError(stage, error) {
      setupError = `${stage}：${errorText(error)}`;
      console.warn('[dsh-overleaf]', setupError, error);
    }

    /* ---------------------------------- Sidebar source tab ---------------------------------- */

    const SOURCE_CSS = `
      .dsh-ol-src{display:flex;flex-direction:column;height:100%;min-height:0;font-size:13px;color:var(--dsw-alias-label-primary,inherit)}
      .dsh-ol-src-bar{display:flex;align-items:center;flex-wrap:wrap;row-gap:4px;gap:6px;padding:8px 10px 6px;flex:none;min-width:0}
      .dsh-ol-src-name{font-family:ui-monospace,SFMono-Regular,monospace;font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
      .dsh-ol-src .dsh-ol-dirty{color:#e0a100;font-size:10px;line-height:1}
      .dsh-ol-src-bar .dsh-ol-src-spacer{flex:1}
      .dsh-ol-src-bar button{font:inherit;font-size:11.5px;cursor:pointer;border-radius:6px;padding:3px 8px;min-height:24px;border:1px solid var(--dsw-alias-border-l3,color-mix(in srgb,currentColor 15%,transparent));color:inherit;background:transparent;white-space:nowrap}
      .dsh-ol-src-bar button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,currentColor 7%,transparent))}
      .dsh-ol-src-bar button:disabled{opacity:.45;cursor:default}
      .dsh-ol-src-bar button.primary{color:#fff;background:#138a59;border-color:#138a59}
      .dsh-ol-src-bar button.primary:hover:not(:disabled){background:#0f7449}
      .dsh-ol-src-path{padding:0 10px 6px;font-family:ui-monospace,SFMono-Regular,monospace;font-size:11px;opacity:.55;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:none}
      .dsh-ol-src-note{margin:0 10px 6px;padding:6px 9px;border-radius:7px;font-size:11.5px;line-height:1.5;flex:none;overflow-wrap:anywhere}
      .dsh-ol-src-note.error{color:#c34c4c;background:#c34c4c12;border:1px solid #c34c4c33}
      .dsh-ol-src-note.ok{color:#238155;background:#23815510;border:1px solid #23815533}
      .dsh-ol-src-note.warn{color:#a97400;background:#e0a10012;border:1px solid #e0a10033}
      .dsh-ol-src-code{flex:1;min-height:0;width:100%;box-sizing:border-box;border:0;outline:none;resize:none;background:transparent;color:inherit;font-family:ui-monospace,SFMono-Regular,monospace;font-size:12.5px;line-height:1.55;padding:6px 12px 14px;tab-size:2;white-space:pre;overflow:auto}
      .dsh-ol-src-errors{flex:none;max-height:34%;overflow:auto;border-top:1px solid color-mix(in srgb,currentColor 10%,transparent);padding:6px 8px 10px}
      .dsh-ol-src-error{display:block;width:100%;text-align:left;border:0;background:none;color:inherit;font:inherit;font-size:11.5px;line-height:1.5;padding:4px 6px;border-radius:5px;cursor:pointer;overflow-wrap:anywhere}
      .dsh-ol-src-error:hover{background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,currentColor 7%,transparent))}
      .dsh-ol-src-error code{font-family:ui-monospace,SFMono-Regular,monospace;opacity:.75;margin-right:4px}
      .dsh-ol-src-empty{margin:auto;padding:24px 16px;text-align:center;font-size:12px;opacity:.6;line-height:1.6}
    `;

    const FILE_ADDRESS_PREFIX = 'dsh-resource://file/';
    /** Extensions the Sidebar opens in the editable Overleaf source tab. */
    const SOURCE_EXTENSIONS = /\.(tex|bib|sty|cls|def|tikz|pgf|ltx|clo|ins|bst)$/i;
    /** Session -> workspace directory, persisted so `.tex` clicks keep working after a restart. */
    const SESSION_MAP_KEY = 'dsh-overleaf:sessions';

    const sessionDirs = () => {
      try {
        const parsed = JSON.parse(localStorage.getItem(SESSION_MAP_KEY) ?? '{}');
        return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch { return {}; }
    };
    const rememberSession = (sessionId, localDir) => {
      if (typeof sessionId !== 'string' || typeof localDir !== 'string') return;
      const map = sessionDirs();
      map[sessionId] = localDir;
      const keys = Object.keys(map);
      for (const key of keys.slice(0, Math.max(0, keys.length - 40))) delete map[key];
      try { localStorage.setItem(SESSION_MAP_KEY, JSON.stringify(map)); } catch { /* Storage is optional. */ }
    };
    const isKnownSession = (sessionId) => typeof sessionDirs()[sessionId] === 'string';

    /** Parse `dsh-resource://file/session/<id>/<path>`; undefined for anything else. */
    function parseFileAddress(address) {
      const prefix = `${FILE_ADDRESS_PREFIX}session/`;
      if (typeof address !== 'string' || !address.startsWith(prefix)) return undefined;
      const rest = address.slice(prefix.length);
      const slash = rest.indexOf('/');
      if (slash <= 0) return undefined;
      try {
        const sessionId = decodeURIComponent(rest.slice(0, slash));
        const path = rest.slice(slash + 1).split('/').map(decodeURIComponent).join('/');
        return sessionId.length > 0 && path.length > 0 ? { sessionId, path } : undefined;
      } catch { return undefined; }
    }

    /** Build the same address the Sidebar's file tree uses for a workspace-relative path. */
    function fileAddress(sessionId, path) {
      const encode = (segment) => encodeURIComponent(segment).replace(/%3A/gi, ':');
      const normalized = String(path).replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
      return `${FILE_ADDRESS_PREFIX}session/${encode(sessionId)}/${normalized.split('/').map(encode).join('/')}`;
    }

    const basenameOf = (path) => String(path).split('/').pop() ?? String(path);

    /** The conversation keeps the width it has in the reference three-column layout. */
    const CHAT_WIDTH = 400;
    /** The directory pane takes a quarter of the editor area; the source pane takes the rest. */
    const FILES_PANE_RATIO = 0.25;

    /**
     * The store actions behind the mounted dock. The public Sidebar controller
     * can open and focus tabs, but moving a tab or setting a split ratio is not
     * part of it; those live on the pane actions the dock's tab seat receives.
     * Resolve them from the mounted tab DOM, and degrade gracefully when a
     * future renderer stops exposing the same fiber props.
     */
    function findPaneActions(sessionId) {
      const bar = document.querySelector('[class*="rightbarCol"]');
      if (bar === null) return undefined;
      for (const anchor of bar.querySelectorAll('[data-sidebar-right-tab],[data-dockkit-tab]')) {
        const key = Object.keys(anchor).find((name) => name.startsWith('__reactFiber$'));
        let fiber = key === undefined ? undefined : anchor[key];
        for (let depth = 0; depth < 16 && fiber !== undefined && fiber !== null;
          depth += 1, fiber = fiber.return) {
          const props = fiber.memoizedProps;
          if (props?.sessionId === sessionId && typeof props.actions?.resizeSplit === 'function') {
            return props.actions;
          }
        }
      }
      return undefined;
    }

    /** Visible dock panes of the mounted right Sidebar, left to right. */
    function visibleDockPanes() {
      const bar = document.querySelector('[class*="rightbarCol"]');
      if (bar === null) return [];
      return [...bar.querySelectorAll('[data-dockkit-pane]')]
        .filter((pane) => pane.getBoundingClientRect().width > 0
          && pane.closest('[hidden],[aria-hidden="true"]') === null)
        .sort((left, right) => left.getBoundingClientRect().x - right.getBoundingClientRect().x);
    }

    /** The pane holding a visible tab chip, or undefined. */
    function paneOfTab(tabId) {
      const bar = document.querySelector('[class*="rightbarCol"]');
      if (bar === null) return undefined;
      const tab = [...bar.querySelectorAll('[data-dockkit-tab]')]
        .find((element) => element.getAttribute('data-dockkit-tab') === tabId
          && element.getBoundingClientRect().width > 0
          && element.closest('[hidden],[aria-hidden="true"]') === null);
      return tab?.closest('[data-dockkit-pane]') ?? undefined;
    }

    /**
     * The editor pane may have been seeded with a files page by a split. Close
     * it once real editor tabs sit beside it; the tree stays in the left pane.
     */
    function pruneEditorPanes(sessionId, sidebar) {
      const panes = visibleDockPanes();
      if (panes.length < 2) return;
      const leftId = panes[0].dataset.dockkitPane;
      const rightId = panes[1].dataset.dockkitPane;
      const tabs = sidebar.tabsIn?.(sessionId) ?? [];
      if (!tabs.some((tab) => tab.kind === 'files' && paneOfTab(tab.id)?.dataset.dockkitPane === leftId)) return;
      const rightTabs = tabs.filter((tab) => paneOfTab(tab.id)?.dataset.dockkitPane === rightId);
      if (!rightTabs.some((tab) => tab.kind !== 'files' && tab.kind !== 'guide')) return;
      for (const tab of rightTabs) {
        if (tab.kind !== 'files' && tab.kind !== 'guide') continue;
        try { sidebar.closeIn?.(sessionId, tab.id); } catch { /* it can stay */ }
      }
    }

    /** Select one 1-based line in the editor and bring it into view. */
    function selectLine(node, text, line) {
      if (node === null || node === undefined || typeof line !== 'number' || line <= 0) return;
      const lines = text.split('\n');
      const offset = lines.slice(0, Math.min(line - 1, lines.length)).join('\n').length;
      node.focus();
      node.setSelectionRange(offset, offset + (lines[line - 1]?.length ?? 0));
      node.scrollTop = Math.max(0, (line - 3) * 19);
    }

    /**
     * Editable LaTeX source tab in the right Sidebar.
     *
     * Registered only for files inside a workspace this plugin opened (see
     * `isKnownSession`), so `.tex` files elsewhere keep the built-in preview.
     * Reads and writes go through the plugin's RPCs: a save lands in the local
     * workspace exactly like an agent or external-editor write, and the live
     * session pushes it to Overleaf as an OT update.
     */
    function SourceTab({ useTabInfo, api }) {
      const { tab } = useTabInfo();
      const target = parseFileAddress(tab.contentId);
      const sessionId = target?.sessionId;
      const path = target?.path;
      // The directory this plugin opened for the Session, when still remembered;
      // the host can otherwise derive it from the Session header.
      const [localPath] = useState(() => (sessionId === undefined ? undefined : sessionDirs()[sessionId]));
      const where = () => (typeof localPath === 'string' ? { local_path: localPath } : { session_id: sessionId });
      const [file, setFile] = useState(undefined);
      const [dirty, setDirty] = useState(false);
      const [busy, setBusy] = useState('');
      const [error, setError] = useState('');
      const [notice, setNotice] = useState('');
      const [compile, setCompile] = useState(undefined);
      const [hasPdf, setHasPdf] = useState(false);
      const [syncEnded, setSyncEnded] = useState(false);
      const areaRef = useRef(undefined);
      // Where the last navigation asked to land; read when the initial load
      // resolves, so re-clicking an open tab never re-reads (and never drops an
      // unsaved buffer) just to jump to a line.
      const lineRef = useRef(undefined);
      // The latest buffer as the polling timer and the save path see it, without
      // recreating either on every keystroke.
      const live = useRef({ text: '', mtimeMs: 0, dirty: false });

      const adopt = useCallback((result) => {
        live.current = { text: result.text, mtimeMs: result.mtimeMs, dirty: false };
        setFile({ path, text: result.text, mtimeMs: result.mtimeMs });
        setDirty(false);
        const line = lineRef.current;
        if (typeof line === 'number') requestAnimationFrame(() => selectLine(areaRef.current, result.text, line));
      }, [path]);

      useEffect(() => { lineRef.current = tab.navigation?.params?.line; });

      const load = useCallback(async () => {
        if (sessionId === undefined || path === undefined) { setError('无法解析这个文件地址。'); return; }
        setBusy('load');
        try {
          const result = await api('readFile', { ...where(), path });
          adopt(result);
          setError('');
        } catch (e) { setError(errorText(e)); }
        finally { setBusy(''); }
      }, [api, sessionId, path, adopt]);

      useEffect(() => { void load(); }, [load]);

      // A later navigation (an error row, the file tree) only moves the caret.
      useEffect(() => {
        const line = tab.navigation?.params?.line;
        if (typeof line === 'number' && live.current.text !== '') {
          selectLine(areaRef.current, live.current.text, line);
        }
      }, [tab.navigation?.revision]);

      useEffect(() => {
        if (sessionId === undefined || path === undefined) return undefined;
        void api('prepare', where())
          .then((info) => setHasPdf(info.hasPdf === true))
          .catch(() => {});
        return undefined;
      }, [api, sessionId, compile]);

      // The Session knows its workspace root, so this works even before the
      // local-directory hint is available (for example after a restart).
      useEffect(() => {
        if (sessionId === undefined || tab.visible === false) return undefined;
        let cancelled = false;
        void api('live', { ...where(), action: 'status' })
          .then((status) => {
            if (!cancelled) setSyncEnded(status.phase === 'stopped' || status.phase === 'idle');
          })
          .catch(() => {});
        return () => { cancelled = true; };
      }, [api, sessionId, path, tab.visible, localPath]);

      // Collaborators and the agent write the file on disk; adopt those changes
      // while the user has no unsaved edit of their own.
      useEffect(() => {
        if (sessionId === undefined || path === undefined || tab.visible === false) return undefined;
        const timer = setInterval(async () => {
          const area = areaRef.current;
          if (live.current.dirty) return;
          if (area !== null && area !== undefined && document.activeElement === area) return;
          try {
            const result = await api('readFile', { ...where(), path });
            if (result.text === live.current.text) return;
            live.current = { text: result.text, mtimeMs: result.mtimeMs, dirty: false };
            setFile({ path, text: result.text, mtimeMs: result.mtimeMs });
            setNotice('已同步外部改动。');
          } catch { /* the file may be mid-write; try again on the next tick */ }
        }, 2000);
        return () => clearInterval(timer);
      }, [api, sessionId, path, tab.visible]);

      const save = useCallback(async () => {
        if (sessionId === undefined || path === undefined || busy !== '' || !live.current.dirty) return false;
        setBusy('save');
        try {
          const result = await api('writeFile', { ...where(), path,
            text: live.current.text, mtime_ms: live.current.mtimeMs });
          live.current = { ...live.current, mtimeMs: result.mtimeMs, dirty: false };
          setFile((previous) => (previous === undefined ? previous : { ...previous, mtimeMs: result.mtimeMs }));
          setDirty(false);
          setNotice('已保存，正在推送到 Overleaf。');
          setError('');
          return true;
        } catch (e) { setError(errorText(e)); return false; }
        finally { setBusy(''); }
      }, [api, sessionId, path, busy]);

      const compileNow = async () => {
        if (sessionId === undefined) return;
        if (live.current.dirty) {
          const saved = await save();
          if (!saved) return;
        }
        setBusy('compile');
        setCompile(undefined);
        setNotice('');
        try {
          // Make sure a just-saved edit reached Overleaf before the server
          // compiles; otherwise the compile result is one revision behind.
          try { await api('live', { ...where(), action: 'flush' }); } catch { /* snapshot mode */ }
          // Compile the file that is open, not whichever .tex the host guesses.
          const result = await api('compile', { ...where(), main_file: path });
          setCompile(result);
          if (result.status === 'success') {
            setNotice('编译成功，PDF 已更新。点「PDF」查看。');
            setHasPdf(true);
          } else setNotice('编译失败，见下方错误。');
          setError('');
        } catch (e) { setError(errorText(e)); }
        finally { setBusy(''); }
      };

      const openPdf = async () => {
        if (sessionId === undefined) return;
        try { await tab.actions.openResource(fileAddress(sessionId, 'output.pdf'), { preferNewPane: true }); }
        catch (e) { setError(errorText(e)); }
      };

      /**
       * End (or resume) the realtime session without leaving the workspace.
       * Ending flushes the current buffer, closes the watcher and the polling
       * connection, and keeps every file on disk.
       */
      const toggleSync = async () => {
        if (sessionId === undefined || busy !== '') return;
        if (!syncEnded && live.current.dirty) {
          const saved = await save();
          if (!saved) return;
        }
        setBusy('live');
        setNotice('');
        try {
          await api('live', { ...where(), action: syncEnded ? 'start' : 'stop' });
          setSyncEnded(!syncEnded);
          setNotice(syncEnded
            ? '已恢复实时同步。'
            : '已结束实时同步；改动已推送，文件保留在本机。');
          setError('');
        } catch (e) { setError(errorText(e)); }
        finally { setBusy(''); }
      };

      const onKeyDown = (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
          event.preventDefault();
          void save();
        }
      };

      if (target === undefined) {
        return h('div', { className: 'dsh-ol-src' }, h('style', null, SOURCE_CSS),
          h('div', { className: 'dsh-ol-src-empty' }, '无法解析这个文件地址。请从工作区的文件树重新打开。'));
      }

      const jump = (item) => {
        if (typeof item.line === 'number' && (item.file === null || item.file === undefined || item.file === path)) {
          selectLine(areaRef.current, live.current.text, item.line);
          return;
        }
        if (item.file !== null && item.file !== undefined) {
          try {
            tab.actions.openResource(fileAddress(sessionId, item.file),
              typeof item.line === 'number' ? { params: { line: item.line } } : undefined);
          } catch (e) { setError(errorText(e)); }
        }
      };

      const errors = compile === undefined ? [] : compile.errors.slice(0, 12);
      const statusLine = dirty ? '未保存' : busy === 'load' ? '读取中…' : '已保存';

      return h('div', { className: 'dsh-ol-src' }, h('style', null, SOURCE_CSS),
        h('div', { className: 'dsh-ol-src-bar' },
          h('span', { className: 'dsh-ol-src-name' }, basenameOf(path)),
          dirty ? h('span', { className: 'dsh-ol-dirty' }, '●') : null,
          h('span', { className: 'dsh-ol-src-spacer' }),
          h('button', { disabled: busy !== '' || !dirty, onClick: () => { void save(); } },
            busy === 'save' ? '保存中…' : '保存'),
          h('button', { className: 'primary', disabled: busy !== '', onClick: () => { void compileNow(); } },
            busy === 'compile' ? '编译中…' : '编译'),
          hasPdf ? h('button', { disabled: busy !== '', onClick: () => { void openPdf(); } }, 'PDF') : null,
          h('button', { disabled: busy !== '', title: syncEnded
            ? '重新建立与 Overleaf 的实时连接'
            : '推送当前改动后关闭实时连接，停止监听文件；文件保留在本机',
          onClick: () => { void toggleSync(); } },
          busy === 'live' ? '处理中…' : syncEnded ? '恢复同步' : '结束')),
        h('div', { className: 'dsh-ol-src-path' }, `${path} · ${statusLine}`),
        error !== '' ? h('div', { className: 'dsh-ol-src-note error' }, error) : null,
        notice !== '' && error === '' ? h('div', { className: 'dsh-ol-src-note ok' }, notice) : null,
        h('textarea', {
          ref: areaRef,
          className: 'dsh-ol-src-code',
          value: file?.text ?? '',
          disabled: file === undefined,
          spellCheck: false,
          autoComplete: 'off',
          onKeyDown,
          onChange: (event) => {
            live.current = { ...live.current, text: event.target.value, dirty: true };
            setFile((previous) => ({ ...previous, text: event.target.value }));
            setDirty(true);
            setNotice('');
          },
        }),
        errors.length > 0 ? h('div', { className: 'dsh-ol-src-errors' }, errors.map((item, index) => h('button', {
          key: index, className: 'dsh-ol-src-error', onClick: () => jump(item) },
        item.file !== null && item.file !== undefined
          ? h('code', null, `${item.file}${typeof item.line === 'number' ? `:${item.line}` : ''}`)
          : null,
        item.message))) : null);
    }

    const canOpenSource = (address) => {
      const file = parseFileAddress(address);
      return file !== undefined && SOURCE_EXTENSIONS.test(file.path) && isKnownSession(file.sessionId);
    };

    /** Build the RPC caller once per panel. */
    function makeApi(ctx) {
      return async (method, request, signal) => {
        const result = await ctx.connection.rpc.call('/api', `overleafUi/${method}`,
          { args: request === undefined ? {} : { request } }, signal);
        if (!result.ok) throw new Error(result.error.message);
        return result.value;
      };
    }

    /** One server row: session state, login/logout. */
    function ServerCard({ server, primary, onLogin, onLogout, busy, notice, error }) {
      const [origin, setOrigin] = useState(server?.origin ?? primary);
      const [cookie, setCookie] = useState('');
      const [editing, setEditing] = useState(server === undefined);
      if (server !== undefined && server.loggedIn && !editing) {
        return h('div', { className: 'dsh-ol-card' },
          h('div', { className: 'dsh-ol-row-head' },
            h('div', null,
              h('div', { className: 'dsh-ol-title' }, origin),
              h('div', { className: 'dsh-ol-sub' }, server.email.length > 0 ? `已登录：${server.email}` : '已登录')),
            h('div', { className: 'dsh-ol-actions' },
              h('button', { disabled: busy, onClick: () => setEditing(true) }, '更换 Cookie'),
              h('button', { className: 'dsh-ol-danger', disabled: busy, onClick: () => onLogout(origin) }, '退出登录'))));
      }
      return h('div', { className: 'dsh-ol-card' },
        h('h2', null, '登录 Overleaf'),
        error ? h('p', { className: 'dsh-ol-error' }, error) : null,
        notice ? h('p', { className: 'dsh-ol-ok' }, notice) : null,
        h('p', { className: 'dsh-ol-muted', style: { marginBottom: 16 } },
          '在浏览器中打开 Overleaf 并登录 → F12 开发者工具 → 网络（Network）→ 刷新 → 任选请求，复制请求头里整行 Cookie 粘贴到下面。Cookie 只保存在本机。'),
        h('div', { className: 'dsh-ol-field' },
          h('label', { htmlFor: 'dsh-ol-origin' }, '服务器地址'),
          h('input', { id: 'dsh-ol-origin', value: origin, placeholder: 'https://www.overleaf.com',
            onChange: (event) => setOrigin(event.target.value), spellCheck: false })),
        h('div', { className: 'dsh-ol-field' },
          h('label', { htmlFor: 'dsh-ol-cookie' }, 'Cookie'),
          h('textarea', { id: 'dsh-ol-cookie', value: cookie,
            placeholder: 'overleaf_session2=s%3A…（自建版本是 sharelatex.sid=…）',
            onChange: (event) => setCookie(event.target.value), spellCheck: false, autoComplete: 'off' })),
        h('div', { className: 'dsh-ol-actions', style: { justifyContent: 'flex-end' } },
          server !== undefined ? h('button', { disabled: busy, onClick: () => setEditing(false) }, '取消') : null,
          h('button', { className: 'dsh-ol-primary', disabled: busy || cookie.trim().length === 0,
            onClick: () => onLogin({ base_url: origin.trim(), cookie: cookie.trim() }, () => setCookie('')) },
            busy ? '验证中…' : '验证并登录')));
    }

    /** Live-sync status chip plus start/stop/pause. */
    function LiveBar({ status, onLive, busy }) {
      if (status === undefined) return null;
      const phase = status.phase ?? 'idle';
      const running = phase === 'connected' || phase === 'connecting' || phase === 'reconnecting';
      return h('div', { className: 'dsh-ol-toolbar' },
        h('span', { className: `dsh-ol-chip ${phase}` }, h('span', { className: 'dot' }),
          `${phaseLabel[phase] ?? phase}${status.paused ? ' · 已暂停' : ''}`),
        h('span', { className: 'dsh-ol-muted' },
          `协作者 ${status.collaborators ?? 0} · 文档 ${status.joinedDocs ?? 0} · 待推送 ${status.pending ?? 0}`),
        running ? h('button', { disabled: busy, onClick: () => onLive(status.paused ? 'resume' : 'pause') },
          status.paused ? '恢复推送' : '暂停推送') : null,
        running
          ? h('button', { disabled: busy, onClick: () => onLive('stop') }, '停止实时同步')
          : h('button', { disabled: busy, onClick: () => onLive('start') }, '启动实时同步'),
        status.error ? h('span', { className: 'dsh-ol-dirty' }, status.error) : null);
    }

    /** File tree + textarea editor + compile results for one workspace. */
    function WorkspaceEditor({ workspace, api, openPdf, onClose }) {
      const [entries, setEntries] = useState([]);
      const [file, setFile] = useState(undefined);
      const [dirty, setDirty] = useState(false);
      const [status, setStatus] = useState(undefined);
      const [busy, setBusy] = useState('');
      const [error, setError] = useState('');
      const [notice, setNotice] = useState('');
      const [compile, setCompile] = useState(undefined);
      const codeRef = useRef(undefined);

      const loadFiles = useCallback(async () => {
        const result = await api('files', { local_path: workspace.localDir });
        setEntries(result.entries);
      }, [api, workspace.localDir]);

      const openFile = useCallback(async (path, line) => {
        setBusy(`open:${path}`);
        try {
          const result = await api('readFile', { local_path: workspace.localDir, path });
          setFile({ path, text: result.text, mtimeMs: result.mtimeMs });
          setDirty(false);
          setError('');
          if (line !== undefined && line !== null) {
            requestAnimationFrame(() => {
              const node = codeRef.current;
              if (node === undefined || node === null) return;
              const lines = result.text.split('\n');
              const offset = lines.slice(0, Math.max(0, line - 1)).join('\n').length;
              node.focus();
              node.setSelectionRange(offset, offset + (lines[line - 1]?.length ?? 0));
            });
          }
        } catch (e) { setError(errorText(e)); } finally { setBusy(''); }
      }, [api, workspace.localDir]);

      const refreshStatus = useCallback(async () => {
        try { setStatus(await api('status', { local_path: workspace.localDir })); } catch { /* keep last */ }
      }, [api, workspace.localDir]);

      useEffect(() => {
        loadFiles().catch((e) => setError(errorText(e)));
        void refreshStatus();
        const timer = setInterval(() => { void refreshStatus(); }, POLL_MS);
        return () => clearInterval(timer);
      }, [loadFiles, refreshStatus]);

      useEffect(() => {
        if (file !== undefined) return;
        const tex = entries.filter(entry => entry.type === 'file' && entry.path.endsWith('.tex'));
        const preferred = tex.find(entry => entry.path.toLowerCase() === 'main.tex') ?? tex[0];
        if (preferred !== undefined) void openFile(preferred.path);
      }, [entries, file, openFile]);

      const save = useCallback(async () => {
        if (file === undefined || !dirty) return true;
        setBusy('save');
        try {
          const result = await api('writeFile', { local_path: workspace.localDir, path: file.path,
            text: file.text, mtime_ms: file.mtimeMs });
          setFile({ ...file, mtimeMs: result.mtimeMs });
          setDirty(false);
          setNotice('已保存，改动正在推送到 Overleaf。');
          return true;
        } catch (e) { setError(errorText(e)); return false; } finally { setBusy(''); }
      }, [api, workspace.localDir, file, dirty]);

      const compileNow = useCallback(async () => {
        if (dirty && !(await save())) return;
        setBusy('compile'); setCompile(undefined);
        try {
          try { await api('live', { local_path: workspace.localDir, action: 'flush' }); } catch { /* snapshot mode */ }
          const mainFile = file?.path;
          const result = await api('compile', { local_path: workspace.localDir,
            ...(mainFile !== undefined ? { main_file: mainFile } : {}) });
          setCompile(result);
          setNotice(result.status === 'success' ? '编译成功，PDF 已更新。' : '编译失败，见下方错误。');
        } catch (e) { setError(errorText(e)); } finally { setBusy(''); }
      }, [api, workspace.localDir, dirty, save, file?.path]);

      const onLive = async (action) => {
        setBusy('live');
        try { setStatus(await api('live', { local_path: workspace.localDir, action })); }
        catch (e) { setError(errorText(e)); } finally { setBusy(''); }
      };

      const onKeyDown = (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
          event.preventDefault();
          void save();
        }
      };

      const header = h('div', { className: 'dsh-ol-row-head', style: { marginBottom: 12 } },
        h('div', null,
          h('div', { className: 'dsh-ol-title' }, workspace.projectName),
          h('div', { className: 'dsh-ol-sub' }, workspace.localDir)),
        h('div', { className: 'dsh-ol-actions' },
          h('button', { disabled: busy !== '', onClick: openPdf }, '打开 PDF'),
          h('button', { disabled: busy !== '', onClick: onClose }, '收起编辑器')));

      const fileList = h('div', { className: 'dsh-ol-files' }, entries.map((entry) => h('button', {
        key: entry.path,
        className: `dsh-ol-file${entry.type === 'folder' ? ' folder' : ''}${file?.path === entry.path ? ' active' : ''}`,
        disabled: entry.type === 'folder' || busy !== '',
        style: { paddingLeft: 8 + (entry.path.split('/').length - 1) * 12 },
        onClick: () => { void openFile(entry.path); },
      }, entry.type === 'folder' ? '▸ ' : '  ', entry.path.split('/').pop())));

      const codeBar = h('div', { className: 'dsh-ol-codebar' },
        h('span', { className: 'dsh-ol-code-name' }, file?.path ?? '未选择文件'),
        h('span', { className: 'dsh-ol-actions' },
          dirty ? h('span', { className: 'dsh-ol-dirty' }, '未保存') : null,
          h('button', { disabled: !dirty || busy !== '', onClick: () => { void save(); } },
            busy === 'save' ? '保存中…' : '保存 (⌘S)'),
          h('button', { className: 'dsh-ol-primary', disabled: busy !== '', onClick: () => { void compileNow(); } },
            busy === 'compile' ? '编译中…' : '编译')));

      const codeArea = h('textarea', {
        ref: codeRef,
        className: 'dsh-ol-code',
        value: file?.text ?? '',
        disabled: file === undefined,
        spellCheck: false,
        onKeyDown,
        onChange: (event) => { setFile({ ...file, text: event.target.value }); setDirty(true); setNotice(''); },
      });

      const errorList = compile === undefined || compile.errors.length === 0 ? null
        : h('ul', { className: 'dsh-ol-errlist' }, compile.errors.slice(0, 20).map((item, index) => h('li', { key: index },
          item.file !== undefined && item.line !== null && item.line !== undefined
            ? h('code', { onClick: () => { void openFile(item.file, item.line); } }, `${item.file}:${item.line}: `)
            : null,
          item.message)));

      const compilePanel = compile === undefined ? null : h('div', null,
        h('p', { className: compile.status === 'success' ? 'dsh-ol-ok' : 'dsh-ol-error' },
          compile.status === 'success' ? '编译成功。' : '编译失败。',
          compile.pdfPath ? ' PDF 已写入工作区，可用「打开 PDF」或侧边栏「文件」查看。' : ''),
        errorList);

      return h('div', { className: 'dsh-ol-card' }, header,
        h(LiveBar, { status, onLive, busy: busy !== '' }),
        error ? h('p', { className: 'dsh-ol-error' }, error) : null,
        notice ? h('p', { className: 'dsh-ol-ok' }, notice) : null,
        h('div', { className: 'dsh-ol-editor' }, fileList,
          h('div', { className: 'dsh-ol-code-wrap' }, codeBar, codeArea)),
        compilePanel);
    }

    function OverleafPanel({ services }) {
      const { ctx, api, enterWorkspace, openRecord } = services;
      const [data, setData] = useState(undefined);
      const [busy, setBusy] = useState('');
      const [error, setError] = useState('');
      const [notice, setNotice] = useState('');
      const [loginError, setLoginError] = useState('');
      const [openError, setOpenError] = useState('');
      const [editing, setEditing] = useState(undefined);
      const [live, setLive] = useState({});
      // Session titles, recency and workspace membership live in client stores;
      // bump the render when either changes so the list never goes stale.
      const [, setSessionTick] = useState(0);

      const refresh = useCallback(async () => {
        try { setData(await api('list')); } catch (e) { setError(errorText(e)); }
      }, [api]);

      useEffect(() => { void refresh(); }, [refresh]);

      useEffect(() => {
        const sessions = sessionService(ctx);
        const offSessions = sessions?.list?.subscribe?.(() => setSessionTick((tick) => tick + 1));
        const offWorkspaces = ctx.workspaces.list.subscribe?.(() => setSessionTick((tick) => tick + 1));
        const offSelection = ctx.uiWorkspace?.selection?.subscribe?.(() => setSessionTick((tick) => tick + 1));
        return () => { offSessions?.(); offWorkspaces?.(); offSelection?.(); };
      }, [ctx]);

      // Live phases come from the host's in-memory sessions, not from the
      // project list, so they need their own cheap poll while the panel is open.
      useEffect(() => {
        let cancelled = false;
        const load = async () => {
          try {
            const overview = await api('overview');
            if (cancelled) return;
            setLive(Object.fromEntries(overview.workspaces.map((item) => [item.localDir, item])));
          } catch { /* keep the last known status */ }
        };
        void load();
        const timer = setInterval(() => {
          if (document.visibilityState === 'visible') void load();
        }, 4000);
        return () => { cancelled = true; clearInterval(timer); };
      }, [api]);

      const run = async (key, action) => {
        setBusy(key); setError(''); setNotice(''); setLoginError(''); setOpenError('');
        try { await action(); await refresh(); } catch (e) {
          const message = errorText(e);
          if (key.startsWith('login')) setLoginError(message);
          else if (key.startsWith('open')) setOpenError(message);
          else setError(message);
        } finally { setBusy(''); }
      };

      const onLogin = (request, done) => run('login', async () => {
        const result = await api('login', request);
        done?.();
        setNotice(`已登录 ${result.email || result.origin}。`);
      });
      const onLogout = (origin) => run(`logout:${origin}`, async () => {
        await api('logout', { base_url: origin });
        setNotice('已退出登录；已打开的工作区文件保留在本机。');
      });
      const onOpen = (project) => run(`open:${project.id}`, async () => {
        const primary = data?.primary ?? 'https://www.overleaf.com';
        const result = await api('open', { base_url: primary, project_id: project.id, project_name: project.name });
        setNotice(`已打开 ${project.name}。正在恢复最近的会话与编辑区…`);
        if (result.workspaceId !== null && result.workspaceId !== undefined) {
          await enterWorkspace(result.workspaceId, result.localDir);
        }
      });

      /** Enter the workspace; the right Sidebar opens the PDF along with the sources. */
      const openPdf = async (workspace) => {
        setError('');
        try {
          const item = workspaceItemOf(ctx, workspace.localDir);
          if (item === undefined) {
            setError('工作区尚未就绪，请重新打开一次这个项目。');
            return;
          }
          await enterWorkspace(item.workspaceId, workspace.localDir);
        } catch (e) { setError(errorText(e)); }
      };

      /** Resume one conversation from the project's history. */
      const openSession = (workspace, session) => run(`session:${session.id}`, async () => {
        const item = workspaceItemOf(ctx, workspace.localDir);
        if (item === undefined) throw new Error('工作区尚未就绪，请重新打开一次这个项目。');
        await enterWorkspace(item.workspaceId, workspace.localDir, { sessionId: session.id });
        setNotice(`已打开会话：${sessionLabel(session)}`);
      });

      /** Start a fresh blank conversation in the project, keeping the old ones. */
      const newSession = (workspace) => run(`new:${workspace.localDir}`, async () => {
        await openRecord(workspace, { fresh: true });
        setNotice(`已在 ${workspace.projectName} 中开始新会话；旧会话保留在项目列表里。`);
      });

      /** Release the socket and filesystem watcher for one project. */
      const stopLive = (workspace) => run(`stop:${workspace.localDir}`, async () => {
        await api('live', { local_path: workspace.localDir, action: 'stop' });
        setNotice(`已结束 ${workspace.projectName} 的实时同步；工作区文件保留在本机。`);
      });

      const startLive = (workspace) => run(`start:${workspace.localDir}`, async () => {
        await api('live', { local_path: workspace.localDir, action: 'start' });
        setNotice(`已恢复 ${workspace.projectName} 的实时同步。`);
      });

      if (data === undefined) {
        return h('div', { className: 'dsh-ol-page' }, h('style', null, CSS),
          h('div', { className: 'dsh-ol-inner' }, h('p', { className: 'dsh-ol-muted' }, '正在加载 Overleaf 项目…')));
      }

      const primary = data.servers.find(entry => entry.origin === data.primary);
      const editingWorkspace = editing === undefined ? undefined
        : data.workspaces.find(entry => entry.localDir === editing)
          ?? { localDir: editing, projectName: editing.split('/').pop(), server: data.primary, bound: true };

      const projectCard = h('div', { className: 'dsh-ol-card' },
        h('h2', null, 'Overleaf 项目'),
        openError ? h('p', { className: 'dsh-ol-error' }, openError) : null,
        data.projects.length === 0
          ? h('div', { className: 'dsh-ol-empty' }, '没有可用项目。先在上方登录，或确认账号下有项目。')
          : h('div', { className: 'dsh-ol-rows' }, data.projects.map((project) => h('div', {
            className: 'dsh-ol-row', key: project.id },
            h('div', { className: 'dsh-ol-row-head' },
              h('div', null,
                h('div', { className: 'dsh-ol-title' }, project.name),
                h('div', { className: 'dsh-ol-sub' },
                  project.lastUpdated ? `最近更新 ${new Date(project.lastUpdated).toLocaleString()}` : project.id)),
              h('div', { className: 'dsh-ol-actions' },
                h('button', { className: 'dsh-ol-primary', disabled: busy !== '',
                  onClick: () => { void onOpen(project); } },
                busy === `open:${project.id}` ? '打开中…' : '打开为工作区')))))));

      const workspaceCard = h('div', { className: 'dsh-ol-card' },
        h('h2', null, '已打开的项目与会话'),
        data.workspaces.length === 0
          ? h('div', { className: 'dsh-ol-empty' }, '还没有打开过 Overleaf 项目。先在下方「Overleaf 项目」里打开一个。')
          : h('div', { className: 'dsh-ol-rows' }, data.workspaces.map((workspace) => {
            const status = live[workspace.localDir];
            const phase = status?.phase ?? 'idle';
            const running = phase === 'connected' || phase === 'connecting' || phase === 'reconnecting';
            const collaborators = status?.collaborators ?? 0;
            const sessions = sessionsOfWorkspace(ctx, workspace.localDir);
            const current = ctx.uiWorkspace?.selection?.getSnapshot?.().sessionId;
            const openingLast = busy === `enter:${workspace.localDir}`;
            return h('div', { className: 'dsh-ol-row', key: workspace.localDir },
              h('div', { className: 'dsh-ol-row-head' },
                h('div', null,
                  h('div', { className: 'dsh-ol-title' }, workspace.projectName),
                  h('div', { className: 'dsh-ol-sub' }, workspace.localDir)),
                h('div', { className: 'dsh-ol-actions' },
                  h('span', { className: `dsh-ol-chip ${phase}` }, h('span', { className: 'dot' }),
                    `${phaseLabel[phase] ?? phase}${phase === 'connected' && collaborators > 0 ? ` · ${collaborators} 人在线` : ''}`),
                  h('button', { className: 'dsh-ol-primary', disabled: busy !== '' || !workspace.bound,
                    onClick: () => { void run(`enter:${workspace.localDir}`, () => openRecord(workspace)); } },
                  openingLast ? '打开中…' : '打开最近会话'),
                  h('button', { disabled: busy !== '' || !workspace.bound,
                    onClick: () => { void newSession(workspace); } },
                  busy === `new:${workspace.localDir}` ? '创建中…' : '新建会话'),
                  running
                    ? h('button', { disabled: busy !== '', onClick: () => { void stopLive(workspace); } },
                      busy === `stop:${workspace.localDir}` ? '结束中…' : '结束同步')
                    : h('button', { disabled: busy !== '' || !workspace.bound,
                      onClick: () => { void startLive(workspace); } },
                    busy === `start:${workspace.localDir}` ? '启动中…' : '启动同步'),
                  h('button', { disabled: busy !== '' || !workspace.bound,
                    onClick: () => setEditing(workspace.localDir) }, '编辑'))),
              h('div', { className: 'dsh-ol-sessions' },
                sessions.length === 0
                  ? h('div', { className: 'dsh-ol-session-empty' }, '还没有会话。点击「新建会话」开始。')
                  : sessions.map((session) => h('button', {
                    key: session.id,
                    className: `dsh-ol-session${session.id === current ? ' current' : ''}`,
                    title: session.blank === true ? '尚未发送消息的草稿会话' : sessionLabel(session),
                    disabled: busy !== '' || !workspace.bound,
                    onClick: () => { void openSession(workspace, session); },
                  }, h('span', { className: 'dsh-ol-session-title' }, sessionLabel(session)),
                  h('span', { className: 'dsh-ol-session-time' }, sessionTime(session.updatedAt))))));
          })));

      return h('div', { className: 'dsh-ol-page' }, h('style', null, CSS),
        h('div', { className: 'dsh-ol-inner' },
          h('div', { className: 'dsh-ol-header' },
            h('div', null, h('h1', null, 'Overleaf'), h('p', { className: 'dsh-ol-muted' },
              '把 Overleaf 项目打开为本地工作区：实时双向同步、内置编辑器、编译与 PDF 预览，AI 的修改同样实时同步。')))),
        h('div', { className: 'dsh-ol-inner' },
          error ? h('p', { className: 'dsh-ol-error' }, error) : null,
          setupError !== '' ? h('p', { className: 'dsh-ol-error' }, setupError) : null,
          workspaceCard,
          editingWorkspace !== undefined ? h(WorkspaceEditor, {
            key: editingWorkspace.localDir, workspace: editingWorkspace, api,
            openPdf: () => { void openPdf(editingWorkspace); },
            onClose: () => setEditing(undefined) }) : null,
          h(ServerCard, { server: primary, primary: data.primary, onLogin, onLogout,
            busy: busy.startsWith('login') || busy.startsWith('logout'), notice, error: loginError }),
          projectCard));
    }

    /** Compare two workspace paths without caring about a trailing separator. */
    const sameDir = (left, right) => {
      const clean = (value) => String(value ?? '').replace(/\/+$/u, '') || '/';
      return clean(left) === clean(right);
    };

    /** The client Session catalog, owned by the workspace package. */
    const sessionService = (ctx) => ctx.get?.('sessions') ?? ctx.sessions;

    /** Currently registered workspaces. */
    function workspaceItems(ctx) {
      try { return ctx.workspaces.list.getSnapshot?.().items ?? []; } catch { return []; }
    }

    /** The registered workspace that owns a directory, when there is one. */
    function workspaceItemOf(ctx, localDir) {
      return workspaceItems(ctx).find((item) => sameDir(item.path, localDir));
    }

    /**
     * Conversations in a Workspace, newest first.
     *
     * Mirrors the native browser: archived, subagent and non-current blank
     * Sessions are left out, so an untouched draft never hides real history.
     */
    function sessionsOfWorkspace(ctx, localDir) {
      const workspace = workspaceItemOf(ctx, localDir);
      const list = sessionService(ctx)?.list?.getSnapshot?.();
      if (workspace === undefined || list?.byId === undefined) return [];
      const archived = new Set(ctx.workspaces.list.getSnapshot?.().archivedSessionIds ?? []);
      const current = ctx.uiWorkspace?.selection?.getSnapshot?.().sessionId;
      return workspace.sessionIds
        .map((id) => list.byId[id])
        .filter((session) => session !== undefined && session.origin !== 'subagent' && !archived.has(session.id))
        .filter((session) => !session.blank || session.id === current)
        .sort((left, right) => (Number(right.updatedAt) || 0) - (Number(left.updatedAt) || 0));
    }

    /**
     * Which conversation opening a Workspace should resume: the one already on
     * screen, otherwise the most recently updated non-blank one. Reopening a
     * project must not silently create another blank Session and strand its
     * previous chat.
     */
    function resumeSessionId(ctx, localDir) {
      const workspace = workspaceItemOf(ctx, localDir);
      const sessions = sessionsOfWorkspace(ctx, localDir);
      const current = ctx.uiWorkspace?.selection?.getSnapshot?.().sessionId;
      const onScreen = sessions.find((session) => session.id === current);
      // Keep a real conversation on screen; a blank draft yields to history so
      // clicking a project shows the chat the user last used.
      if (onScreen !== undefined && onScreen.blank !== true) return current;
      const recent = sessions.find((session) => session.blank !== true) ?? sessions[0];
      if (recent !== undefined) return recent.id;
      // The Session catalog can still be loading right after launch. Fall back
      // to registry membership instead of creating another blank conversation.
      const archived = new Set(ctx.workspaces.list.getSnapshot?.().archivedSessionIds ?? []);
      return workspace?.sessionIds?.find((id) => !archived.has(id));
    }

    /** Human label for a Session summary. */
    function sessionLabel(session) {
      if (session.blank === true) return '新会话（草稿）';
      const title = typeof session.title === 'string' ? session.title.trim() : '';
      if (title.length > 0) return title;
      const displayed = typeof session.displayTitle === 'string' ? session.displayTitle.trim() : '';
      return displayed.length > 0 ? displayed : '未命名会话';
    }

    /** Short relative time for a Session summary. */
    function sessionTime(updatedAt) {
      const value = typeof updatedAt === 'string' ? Date.parse(updatedAt) : Number(updatedAt);
      if (!Number.isFinite(value)) return '';
      const delta = Date.now() - value;
      if (delta < 60_000) return '刚刚';
      if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`;
      if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} 小时前`;
      return new Date(value).toLocaleDateString();
    }

    /**
     * Swap the frame's content tracks while an Overleaf Session is active.
     *
     * DSH keeps no left-hand content sidebar, and its right dock is the only
     * place that can host the source tree, editor and PDF. Rather than duplicate
     * that panel, move its grid track in front of the conversation track. Both
     * tracks keep their existing widths, so dragging and the right-panel
     * controls continue to use the harness's own layout state.
     */
    function createOverleafLayout(ctx) {
      const style = document.createElement('style');
      style.textContent = LAYOUT_CSS;
      document.head.append(style);

      let wanted = false;
      let frame;
      let scheduled;
      let disposed = false;
      let frameObserver;
      let resizeObserver;
      let drag;
      /** Conversation width in the flipped layout; dragging the grip changes it. */
      let chatWidth = CHAT_WIDTH;
      /** True while this plugin collapsed the native project sidebar for the three columns. */
      let collapsedSidebar = false;
      let collapseTimer;
      let restoreTimer;
      let lastCollapseToggle = 0;

      // The harness's own divider assumes the panel is on the right: dragging it
      // away from the panel's edge grows the centre. With the tracks swapped the
      // pointer moves the other way, so a small divider of our own moves the
      // boundary between the editor and the conversation.
      const grip = document.createElement('div');
      grip.className = 'dsh-ol-flip-handle';
      grip.setAttribute('role', 'separator');
      grip.setAttribute('aria-orientation', 'vertical');
      grip.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || frame === undefined) return;
        event.preventDefault();
        drag = { id: event.pointerId, start: event.clientX, base: chatWidth };
        grip.setPointerCapture(event.pointerId);
      });
      grip.addEventListener('pointermove', (event) => {
        if (drag?.id !== event.pointerId) return;
        event.preventDefault();
        const parsed = frame === undefined ? undefined : parse(frame.style.gridTemplateColumns);
        const room = frame === undefined ? 0 : frame.clientWidth - (parsed?.sidebar ?? 0);
        // The grip trades width between the editor area and the conversation.
        chatWidth = Math.max(CHAT_WIDTH, Math.min(Math.max(CHAT_WIDTH, room - 300),
          drag.base - (event.clientX - drag.start)));
        schedule();
      });
      const endDrag = (event) => {
        if (drag?.id !== event.pointerId) return;
        if (grip.hasPointerCapture(event.pointerId)) grip.releasePointerCapture(event.pointerId);
        drag = undefined;
      };
      grip.addEventListener('pointerup', endDrag);
      grip.addEventListener('pointercancel', endDrag);
      grip.addEventListener('lostpointercapture', endDrag);

      const parse = (value) => {
        const match = /^(\d+(?:\.\d+)?)px\s+minmax\((?:0px|\d+(?:\.\d+)?px),\s*1fr\)\s+minmax\(0px,\s*(\d+(?:\.\d+)?)px\)$/u.exec(value);
        return match === null ? undefined : { sidebar: Number(match[1]), rightbarMax: Number(match[2]) };
      };

      const hideGrip = () => {
        grip.style.display = 'none';
        grip.remove();
      };

      const apply = () => {
        scheduled = undefined;
        if (disposed || !wanted) return;
        const center = document.querySelector('[class*="centerCol"]');
        const next = center?.parentElement ?? undefined;
        if (next !== frame) {
          frameObserver?.disconnect();
          frame = next;
          if (frame !== undefined) {
            frameObserver = new MutationObserver(() => schedule());
            frameObserver.observe(frame, { attributes: true, attributeFilter: ['style', 'class'] });
            if (typeof ResizeObserver === 'function') {
              resizeObserver?.disconnect();
              resizeObserver = new ResizeObserver(() => schedule());
              resizeObserver.observe(frame);
            }
          }
        }
        if (frame === undefined) {
          hideGrip();
          return;
        }
        const parsed = parse(frame.style.gridTemplateColumns);
        if (parsed === undefined) {
          frame.classList.remove('dsh-ol-flipped');
          frame.style.removeProperty('--dsh-ol-flipped-columns');
          frame.style.removeProperty('--dsh-ol-flipped-handle');
          hideGrip();
          return;
        }
        const available = frame.clientWidth - parsed.sidebar - chatWidth;
        // The native right track is capped at 70% of the window; the reference
        // three-column layout gives the editor area the rest of the width and
        // leaves the conversation a fixed 400px. Respect a closed right panel.
        const rightbar = parsed.rightbarMax === 0 ? 0 : Math.max(0, available);
        const columns = `${parsed.sidebar}px minmax(0px, ${rightbar}px) minmax(400px, 1fr)`;
        const handle = `${parsed.sidebar + rightbar}px`;
        if (frame.style.getPropertyValue('--dsh-ol-flipped-columns') !== columns) {
          frame.style.setProperty('--dsh-ol-flipped-columns', columns);
        }
        if (frame.style.getPropertyValue('--dsh-ol-flipped-handle') !== handle) {
          frame.style.setProperty('--dsh-ol-flipped-handle', handle);
        }
        frame.classList.add('dsh-ol-flipped');
        if (grip.parentElement !== frame) frame.append(grip);
        grip.style.left = handle;
        grip.style.display = rightbar > 0 && !frame.hasAttribute('data-rightbar-fullscreen')
          ? 'block' : 'none';
      };

      const schedule = () => {
        if (disposed || scheduled !== undefined) return;
        // Timers still run while the window is occluded; requestAnimationFrame
        // does not, and a workspace switch must not wait for the next paint.
        scheduled = setTimeout(apply, 0);
      };

      const setActive = (active) => {
        if (disposed || active === wanted) return;
        wanted = active;
        if (!wanted) {
          clearInterval(collapseTimer);
          collapseTimer = undefined;
          clearTimeout(restoreTimer);
          restoreTimer = undefined;
          const restore = collapsedSidebar;
          collapsedSidebar = false;
          // Leave the native project list as the user found it when they leave
          // Overleaf, unless they expanded it themselves in the meantime. The
          // width can settle a render after the class is removed, so check late.
          if (restore) {
            restoreTimer = setTimeout(() => {
              restoreTimer = undefined;
              if (disposed || wanted) return;
              const width = document.querySelector('[class*="sidebarCol"]')?.getBoundingClientRect().width;
              if (width === 0 && typeof ctx.layout?.toggleSidebar === 'function') {
                try { ctx.layout.toggleSidebar(); } catch { /* the next project keeps it collapsed */ }
              }
            }, 900);
          }
          frame?.classList.remove('dsh-ol-flipped');
          frame?.style.removeProperty('--dsh-ol-flipped-columns');
          frame?.style.removeProperty('--dsh-ol-flipped-handle');
          frameObserver?.disconnect();
          resizeObserver?.disconnect();
          frameObserver = undefined;
          resizeObserver = undefined;
          frame = undefined;
          drag = undefined;
          hideGrip();
          return;
        }
        clearTimeout(restoreTimer);
        restoreTimer = undefined;
        apply();
        // Entering or returning to an Overleaf Session always starts with the
        // file tree as the left column.
        collapseSidebar();
      };

      /** One collapse attempt; uses the native track width, which updates first. */
      const tryCollapse = () => {
        if (disposed || !wanted) return;
        if (frame === undefined) frame = document.querySelector('[class*="centerCol"]')?.parentElement;
        const parsed = frame === undefined ? undefined : parse(frame.style.gridTemplateColumns);
        const width = parsed?.sidebar;
        if (typeof width !== 'number' || width === 0) return;
        if (typeof ctx.layout?.toggleSidebar !== 'function') return;
        // A render can lag behind the store; never toggle twice for one state.
        if (Date.now() - lastCollapseToggle < 600) return;
        try { ctx.layout.toggleSidebar(); } catch { return; }
        lastCollapseToggle = Date.now();
        collapsedSidebar = true;
        // The frame can be replaced by the toggle's render; settle a few times.
        for (const delay of [0, 80, 250, 600]) setTimeout(schedule, delay);
      };

      /**
       * Collapse the native project/session sidebar so the file tree is the
       * leftmost column. Retries briefly because the layout can restore the
       * sidebar's width in the render that follows a Session switch. After that
       * window, expanding it again mid-session stays the user's choice.
       */
      const collapseSidebar = () => {
        if (disposed || !wanted) return;
        clearInterval(collapseTimer);
        tryCollapse();
        const until = Date.now() + 4000;
        collapseTimer = setInterval(() => {
          if (disposed || !wanted || Date.now() > until) {
            clearInterval(collapseTimer);
            collapseTimer = undefined;
            return;
          }
          tryCollapse();
        }, 400);
      };

      const onResize = () => schedule();
      window.addEventListener('resize', onResize);
      // The frame survives normal navigation, but a renderer reload can replace
      // it; re-find it when the section's DOM observer calls setActive again.
      return {
        setActive,
        collapseSidebar,
        refresh() {
          if (!wanted) return;
          if (frame !== undefined && !frame.isConnected) frame = undefined;
          if (scheduled !== undefined) { clearTimeout(scheduled); scheduled = undefined; }
          apply();
        },
        dispose() {
          disposed = true;
          clearInterval(collapseTimer);
          clearTimeout(restoreTimer);
          window.removeEventListener('resize', onResize);
          frameObserver?.disconnect();
          resizeObserver?.disconnect();
          if (scheduled !== undefined) clearTimeout(scheduled);
          if (collapsedSidebar) {
            const width = document.querySelector('[class*="sidebarCol"]')?.getBoundingClientRect().width;
            if (width === 0 && typeof ctx.layout?.toggleSidebar === 'function') {
              try { ctx.layout.toggleSidebar(); } catch { /* leaving the app anyway */ }
            }
            collapsedSidebar = false;
          }
          frame?.classList.remove('dsh-ol-flipped');
          frame?.style.removeProperty('--dsh-ol-flipped-columns');
          frame?.style.removeProperty('--dsh-ol-flipped-handle');
          hideGrip();
          style.remove();
        },
      };
    }

    /**
     * Mount the Overleaf section into the sidebar's region area.
     *
     * The harness has no slot for a plugin-owned sidebar section, so this follows
     * dsh-remote-ssh: a plain DOM section attached to the element whose class
     * contains `regionArea`, kept in place by a MutationObserver.
     *
     * @param ctx - client plugin context.
     * @param api - RPC caller.
     * @param PANEL - the panel key `管理` opens.
     * @param openProject - opens a workspace by its record.
     */
    function installOverleafSidebar(ctx, api, PANEL, openProject) {
      const style = document.createElement('style');
      style.textContent = SIDEBAR_CSS;
      document.head.append(style);

      const host = document.createElement('div');
      host.className = 'dsh-ol-sb';
      host.setAttribute('aria-label', 'Overleaf 项目');
      const layout = createOverleafLayout(ctx);

      let snapshot = { workspaces: [] };
      // Match dsh-remote-ssh: the section starts closed and remembers the
      // user's last choice locally.
      const COLLAPSE_KEY = 'dsh-overleaf:sidebar-collapsed';
      const storedCollapse = (() => {
        try { return localStorage.getItem(COLLAPSE_KEY); } catch { return null; }
      })();
      let collapsed = storedCollapse === null ? true : storedCollapse === '1';
      let disposed = false;
      /** Directory whose long-running action is in progress ('' when idle). */
      let busy = '';
      let flash;
      let flashTimer;
      let frame;

      const el = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
      };

      const subtitle = (workspace) => {
        if (workspace.phase === 'connected') {
          const extras = [workspace.paused ? '已暂停' : '实时同步中'];
          if (workspace.collaborators > 0) extras.push(`${workspace.collaborators} 人在线`);
          if (workspace.pending > 0) extras.push(`${workspace.pending} 待推送`);
          return extras.join(' · ');
        }
        if (workspace.phase === 'error') return workspace.error || '连接出错';
        if (workspace.phase === 'connecting') return '连接中…';
        if (workspace.phase === 'reconnecting') return '重连中…';
        return '未启动实时同步';
      };

      /** Native workspace rows for the directories this plugin owns. */
      const nativeOverleafIds = () => {
        const dirs = snapshot.workspaces.map((workspace) => workspace.localDir);
        const items = ctx.workspaces.list.getSnapshot?.().items ?? [];
        return new Set(items
          .filter((workspace) => dirs.some((dir) => sameDir(dir, workspace.path)))
          .map((workspace) => String(workspace.workspaceId)));
      };

      /** Whether the conversation on screen belongs to an Overleaf workspace. */
      const isOverleafActive = () => {
        const sessionId = ctx.uiWorkspace?.selection?.getSnapshot?.().sessionId;
        if (sessionId === undefined) return false;
        const items = ctx.workspaces.list.getSnapshot?.().items ?? [];
        const workspace = items.find((item) => item.sessionIds?.includes(sessionId));
        return workspace !== undefined
          && snapshot.workspaces.some((entry) => sameDir(entry.localDir, workspace.path));
      };

      // The native Workspaces tree is the only view that groups by directory, so
      // removing its duplicate Overleaf rows is enough; the section above keeps
      // the same projects and still opens their sessions.
      let hiddenFrame;
      function syncNativeGroups() {
        hiddenFrame = undefined;
        if (disposed) return;
        const ids = nativeOverleafIds();
        for (const row of document.querySelectorAll('[data-row-key^="workspace:"]')) {
          const group = row.closest('[class*="groupSection"]');
          if (group === null) continue;
          const id = row.getAttribute('data-row-key')?.slice('workspace:'.length) ?? '';
          group.classList.toggle('dsh-ol-native-hidden', ids.has(id));
        }
      }
      const scheduleNativeGroups = () => {
        if (disposed || hiddenFrame !== undefined) return;
        hiddenFrame = setTimeout(syncNativeGroups, 0);
      };

      const syncMode = () => {
        layout.setActive(isOverleafActive());
        scheduleNativeGroups();
      };

      /** Show a short result under the section header, then fade it out. */
      function setFlash(kind, text) {
        flash = { kind, text };
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => { flash = undefined; render(); }, 8000);
        render();
      }

      /** Run one sidebar action, keeping a single action in flight at a time. */
      async function runAction(workspace, key, action) {
        if (busy !== '') return;
        busy = `${key}:${workspace.localDir}`;
        render();
        try {
          await action();
        } catch (error) {
          setFlash('error', `${workspace.projectName}：${errorText(error)}`);
        } finally {
          busy = '';
          await refresh();
          render();
        }
      }

      function openWorkspaceRow(workspace) {
        return runAction(workspace, 'open', () => openProject(workspace));
      }

      function startNewSession(workspace) {
        if (workspaceItemOf(ctx, workspace.localDir) === undefined) {
          setFlash('error', '工作区尚未就绪，请稍后重试。');
          return Promise.resolve();
        }
        return runAction(workspace, 'new', async () => {
          await openProject(workspace, { fresh: true });
          setFlash('ok', `已在 ${workspace.projectName} 中开始新会话；旧会话仍可从「管理」打开。`);
        });
      }

      /** The `.tex` file in the editor pane, when this workspace is on screen. */
      function activeMainFile(workspace) {
        try {
          const sessionId = ctx.uiWorkspace?.selection?.getSnapshot?.().sessionId;
          if (sessionId === undefined) return undefined;
          if (!sessionsOfWorkspace(ctx, workspace.localDir).some((session) => session.id === sessionId)) {
            return undefined;
          }
          const active = ctx.get?.('sidebarRight')?.active?.();
          const file = parseFileAddress(active?.contentId);
          if (file !== undefined && file.sessionId === sessionId && SOURCE_EXTENSIONS.test(file.path)) {
            return file.path;
          }
        } catch { /* fall back to the guessed main file */ }
        return undefined;
      }

      /** Compile on Overleaf without leaving the current conversation. */
      function compileWorkspace(workspace) {
        return runAction(workspace, 'compile', async () => {
          const mainFile = activeMainFile(workspace);
          try { await api('live', { local_path: workspace.localDir, action: 'flush' }); } catch { /* snapshot mode */ }
          const result = await api('compile', { local_path: workspace.localDir,
            ...(mainFile !== undefined ? { main_file: mainFile } : {}) });
          if (result.status === 'success') {
            const notes = result.errors?.length ?? 0;
            // Do not steal the screen: a PDF tab that is already open refreshes
            // itself; otherwise the editor keeps its compile result in view.
            setFlash('ok', `编译成功，PDF 已更新${notes > 0 ? `（${notes} 条提示）` : ''}：${workspace.projectName}`);
            return;
          }
          const first = result.errors?.[0];
          const location = first?.file !== null && first?.file !== undefined
            ? `${first.file}${typeof first.line === 'number' ? `:${first.line}` : ''}: `
            : '';
          setFlash('error',
            `编译失败（${result.errors?.length ?? 0} 个错误）：${location}${first?.message ?? '未知错误'}`);
        });
      }

      /** Push what is pending, then close the socket and the directory watcher. */
      function toggleSync(workspace) {
        const running = workspace.phase === 'connected' || workspace.phase === 'connecting'
          || workspace.phase === 'reconnecting';
        return runAction(workspace, 'live', async () => {
          await api('live', { local_path: workspace.localDir, action: running ? 'stop' : 'start' });
          setFlash('ok', running
            ? `已结束 ${workspace.projectName} 的实时同步；文件保留在本机。`
            : `已恢复 ${workspace.projectName} 的实时同步。`);
        });
      }

      function render() {
        frame = undefined;
        if (disposed) return;
        const previousBody = host.querySelector('.dsh-ol-sb-body');
        const savedScroll = previousBody?.scrollTop ?? 0;
        host.replaceChildren();

        const head = el('button', 'dsh-ol-sb-head');
        head.type = 'button';
        head.append(el('span', `dsh-ol-sb-chev${collapsed ? '' : ' open'}`, '›'), el('span', '', 'Overleaf'));
        if (setupError !== '') {
          const warning = el('span', '', '⚠');
          warning.title = setupError;
          warning.style.color = '#e56767';
          head.append(warning);
        }
        const manage = el('button', 'dsh-ol-sb-manage', '管理');
        manage.type = 'button';
        manage.addEventListener('click', (event) => { event.stopPropagation(); ctx.layout.selectPanel(PANEL); });
        head.append(manage);
        head.addEventListener('click', () => {
          collapsed = !collapsed;
          try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch { /* Storage is optional. */ }
          render();
        });

        const body = el('div', 'dsh-ol-sb-body');
        if (collapsed) body.style.display = 'none';

        if (snapshot.workspaces.length === 0) {
          const empty = el('div', 'dsh-ol-sb-empty', '还没有 Overleaf 项目。');
          const link = el('button', '', '在面板中登录并打开项目');
          link.type = 'button';
          link.addEventListener('click', (event) => { event.stopPropagation(); ctx.layout.selectPanel(PANEL); });
          empty.append(link);
          body.append(empty);
        }
        if (setupError !== '') {
          const failure = el('div', 'dsh-ol-sb-empty', setupError);
          failure.style.color = '#c34c4c';
          body.append(failure);
        }
        if (flash !== undefined) body.append(el('div', `dsh-ol-sb-note ${flash.kind}`, flash.text));
        for (const workspace of snapshot.workspaces) {
          const running = workspace.phase === 'connected' || workspace.phase === 'connecting'
            || workspace.phase === 'reconnecting';
          const row = el('div', 'dsh-ol-sb-row');
          row.setAttribute('role', 'button');
          row.tabIndex = 0;
          row.title = `${workspace.projectName}\n${workspace.localDir}\n点击打开最近的会话`;
          if (busy !== '') row.setAttribute('aria-disabled', 'true');

          const main = el('div', 'dsh-ol-sb-main');
          main.append(el('span', `dsh-ol-sb-dot ${workspace.phase}`));
          const text = el('span', 'dsh-ol-sb-text');
          text.append(el('span', 'dsh-ol-sb-title', workspace.projectName), el('span', 'dsh-ol-sb-sub', subtitle(workspace)));
          main.append(text);

          // Compile and stop stay reachable without opening the management page;
          // they appear on hover (and on keyboard focus) to keep the list calm.
          const actions = el('div', 'dsh-ol-sb-actions');
          const action = (label, className, handler) => {
            const button = el('button', `dsh-ol-sb-act${className === undefined ? '' : ` ${className}`}`, label);
            button.type = 'button';
            button.disabled = busy !== '';
            button.addEventListener('click', (event) => {
              event.stopPropagation();
              handler();
            });
            actions.append(button);
            return button;
          };
          action(busy === `compile:${workspace.localDir}` ? '编译中…' : '编译', undefined,
            () => { void compileWorkspace(workspace); });
          action(busy === `new:${workspace.localDir}` ? '创建中…' : '新会话', undefined,
            () => { void startNewSession(workspace); });
          action(busy === `live:${workspace.localDir}` ? '处理中…' : running ? '结束' : '同步',
            running ? 'end' : undefined, () => { void toggleSync(workspace); });

          row.append(main, actions);
          row.addEventListener('click', () => { openWorkspaceRow(workspace); });
          row.addEventListener('keydown', (event) => {
            if (event.target !== row) return;
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            openWorkspaceRow(workspace);
          });
          body.append(row);
        }

        host.append(head);
        if (!collapsed) host.append(body);
        if (savedScroll > 0) body.scrollTop = savedScroll;
      }

      const schedule = () => { if (!disposed && frame === undefined) frame = requestAnimationFrame(render); };

      async function refresh() {
        if (disposed) return;
        try {
          snapshot = await api('overview');
          schedule();
          syncMode();
        } catch (error) {
          console.warn('[dsh-overleaf] sidebar refresh failed:', error);
        }
      }

      function attach() {
        const region = document.querySelector('[class*="regionArea"]');
        if (region !== null && host.parentElement !== region) region.append(host);
        syncMode();
        layout.refresh();
      }

      const observer = new MutationObserver(() => {
        if (disposed) return;
        attach();
        scheduleNativeGroups();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      const unsubscribe = ctx.workspaces.list.subscribe(() => { void refresh(); });
      let unsubscribeSelection;
      try {
        unsubscribeSelection = ctx.uiWorkspace.selection?.subscribe?.(() => syncMode());
      } catch (error) {
        console.warn('[dsh-overleaf] session selection subscription failed:', error);
      }
      const timer = setInterval(() => {
        if (document.visibilityState === 'visible') void refresh();
      }, 4000);
      // A split can seed a second files page after the entry pass has run; keep
      // the editor pane free of it while an Overleaf Session is on screen.
      const tidyTimer = setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        const service = ctx.get?.('sidebarRight');
        const sessionId = service?.mounted?.getSnapshot?.();
        if (typeof sessionId === 'string' && isKnownSession(sessionId)) {
          pruneEditorPanes(sessionId, service);
        }
      }, 2000);

      attach();
      void refresh();
      // The panel may have been open before the section existed; refresh once more
      // after the first paint so the section is populated immediately.
      requestAnimationFrame(() => { void refresh(); });

      return {
        refresh,
        collapseSidebar() { layout.collapseSidebar(); },
        refreshLayout() { layout.refresh(); },
        dispose() {
          disposed = true;
          observer.disconnect();
          unsubscribe?.();
          unsubscribeSelection?.();
          clearInterval(timer);
          clearInterval(tidyTimer);
          clearTimeout(flashTimer);
          if (frame !== undefined) cancelAnimationFrame(frame);
          if (hiddenFrame !== undefined) clearTimeout(hiddenFrame);
          for (const group of document.querySelectorAll('.dsh-ol-native-hidden')) {
            group.classList.remove('dsh-ol-native-hidden');
          }
          layout.dispose();
          host.remove();
          style.remove();
        },
      };
    }

    /** The panellist icon: a document with a leaf. */
    function Icon() {
      return h('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('path', { d: 'M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z' }),
        h('path', { d: 'M14 2v5h5' }),
        h('path', { d: 'M9 15c2.5 0 4.5-2 4.5-4.5V9H12c-2.5 0-4.5 2-4.5 4.5v1.2' }));
    }

    return {
      inject: ['slots', 'layout', 'connection', 'workspaces', 'uiWorkspace'],
      apply(ctx) {
        const api = makeApi(ctx);
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        // Optional services are looked up dynamically: declaring them in `inject`
        // would keep the whole plugin (panel and sidebar section included) pending
        // if a deployment does not provide them.
        const sidebarService = () => ctx.get?.('sidebarRight');

        const workspaceIdFor = (localDir) => (ctx.workspaces.list.getSnapshot?.().items ?? [])
          .find((item) => item.path === localDir)?.workspaceId;

        /**
         * Turn the right Sidebar into the three-column arrangement: the file
         * tree alone on the left of the dock, every opened file in the pane next
         * to it. Tabs are moved with the tab-scoped pane actions; closing and
         * reopening them would drop an unsaved editor buffer.
         */
        async function arrangePanes(sessionId, sidebar) {
          const actions = findPaneActions(sessionId);
          const filesTab = (sidebar.tabsIn?.(sessionId) ?? []).find((tab) => tab.kind === 'files');
          if (filesTab === undefined) return;
          const before = sidebar.active?.();

          let panes = visibleDockPanes();
          if (panes.length < 2) {
            const filesPane = paneOfTab(filesTab.id);
            if (filesPane !== undefined && actions?.splitPane !== undefined) {
              try { actions.splitPane(sessionId, filesPane.dataset.dockkitPane); } catch { /* no room to split */ }
              await wait(320);
            }
            panes = visibleDockPanes();
          }
          if (panes.length < 2) return;

          const left = panes[0];
          const right = panes[1];
          const leftId = left.dataset.dockkitPane;
          const rightId = right.dataset.dockkitPane;

          // Restored layouts can have the files tab on either side; the tree
          // belongs on the left regardless. A split may also have seeded a
          // second files page in the new pane, so pick the left one if any.
          const leftFiles = (sidebar.tabsIn?.(sessionId) ?? [])
            .find((tab) => tab.kind === 'files' && paneOfTab(tab.id) === left);
          const treeTab = leftFiles ?? filesTab;
          if (paneOfTab(treeTab.id) !== left) {
            try { actions?.placeTab?.(sessionId, treeTab.id, leftId, 0); } catch { /* leave it */ }
            await wait(160);
          }

          for (const tab of sidebar.tabsIn?.(sessionId) ?? []) {
            if (tab.kind === 'files') continue;
            if (paneOfTab(tab.id)?.dataset.dockkitPane !== leftId) continue;
            try { actions?.placeTab?.(sessionId, tab.id, rightId); } catch { /* leave it */ }
            await wait(80);
          }

          // A split seeds a default page; the editor pane must not keep either
          // a guide or another files page once the real tabs have arrived.
          const rightTabs = (sidebar.tabsIn?.(sessionId) ?? [])
            .filter((tab) => paneOfTab(tab.id)?.dataset.dockkitPane === rightId);
          if (rightTabs.some((tab) => tab.kind !== 'files' && tab.kind !== 'guide')) {
            for (const tab of rightTabs) {
              if (tab.kind !== 'files' && tab.kind !== 'guide') continue;
              try { sidebar.closeIn?.(sessionId, tab.id); } catch { /* it can stay */ }
            }
          }
          await wait(120);

          const split = left.closest('[data-dockkit-split]');
          if (split !== null && actions?.resizeSplit !== undefined) {
            try {
              actions.resizeSplit(sessionId, split.dataset.dockkitSplit,
                [FILES_PANE_RATIO, 1 - FILES_PANE_RATIO]);
            } catch { /* the default split still works */ }
          }

          // Keep the file the user was looking at in front; otherwise prefer
          // this plugin's editable tab over the PDF.
          const currentPane = before === undefined ? undefined : paneOfTab(before.id);
          const preferred = before !== undefined && before.kind !== 'files' && currentPane === right
            ? before
            : (sidebar.tabsIn?.(sessionId) ?? []).find((tab) => tab.kind === 'overleaf-source'
              && paneOfTab(tab.id) === right)
              ?? (sidebar.tabsIn?.(sessionId) ?? []).find((tab) => paneOfTab(tab.id) === right);
          if (preferred !== undefined) {
            try { sidebar.focus?.(preferred.id); } catch { /* keep the pane's tab */ }
          }
          pruneEditorPanes(sessionId, sidebar);
        }

        /**
         * Switch to a workspace and open one of its conversations.
         *
         * `sessionId` resumes a specific conversation, `fresh` starts a blank
         * one, and neither (the normal case) resumes the conversation already on
         * screen or the most recent one. Never default to `openWorkspace`:
         * a workspace whose blank Session has already started gets a brand-new
         * Session there, which is what made previous chats disappear on reopen.
         */
        async function enterWorkspace(workspaceId, localDir, options = {}) {
          let sessionId = options.sessionId;
          if (options.fresh !== true && sessionId === undefined) {
            sessionId = resumeSessionId(ctx, localDir);
          }
          if (options.fresh === true || sessionId === undefined) {
            await ctx.uiWorkspace.openWorkspace(workspaceId, (id) => { sessionId = id; });
            if (sessionId !== undefined) await ctx.uiWorkspace.openSession(sessionId);
          } else {
            await ctx.uiWorkspace.openSession(sessionId);
          }
          if (sessionId === undefined) throw new Error('工作区还没有可用的会话。');
          rememberSession(sessionId, localDir);

          const sidebar = sidebarService();
          // Navigation commits on the next render. Acting before the Sidebar
          // adopts the new Session would open files into the previous one.
          if (sidebar?.mounted?.getSnapshot !== undefined) {
            for (let index = 0; index < 30; index += 1) {
              let mountedId;
              try { mountedId = sidebar.mounted.getSnapshot(); } catch { mountedId = undefined; }
              if (mountedId === sessionId) break;
              await wait(100);
            }
          }

          let info;
          try { info = await api('prepare', { local_path: localDir }); }
          catch (error) { console.warn('[dsh-overleaf] prepare failed:', error); }

          if (sidebar === undefined) {
            console.warn('[dsh-overleaf] sidebarRight service is unavailable; skipping the auto-open');
            return;
          }
          // The Sidebar adopts a Session's store in the render that follows the
          // session switch; navigation commands throw until that commit lands.
          const attempt = async (action) => {
            for (let index = 0; index < 30; index += 1) {
              try { await action(); return true; }
              catch (error) { if (index === 29) console.warn('[dsh-overleaf] sidebar open failed:', error); }
              await wait(100);
            }
            return false;
          };

          // Prefer the guide's replacement rule (as the files shortcut does), so
          // the first open does not leave a "开始" tab next to the file tree.
          const openFiles = () => {
            const target = sidebar.commandTarget?.();
            if (target !== undefined && target.tabId !== undefined
              && typeof sidebar.openTabFromTarget === 'function') {
              sidebar.openTabFromTarget('files', target);
              return;
            }
            sidebar.openTab('files');
          };
          await attempt(openFiles);
          await wait(120);
          if (info?.hasPdf === true) {
            const split = visibleDockPanes().length < 2;
            await attempt(() => sidebar.openResource(fileAddress(sessionId, 'output.pdf'),
              split ? { preferNewPane: true } : {}));
          }
          if (info?.mainFile !== undefined && info?.mainFile !== null) {
            // Name our type explicitly: the default registry ranking also has
            // to compete with a generic sidebar editor, and an already restored
            // editor tab must not hide the editable Overleaf tab.
            const address = fileAddress(sessionId, info.mainFile);
            const options = { kind: 'overleaf-source' };
            try {
              const tabs = sidebar.tabsIn?.(sessionId) ?? [];
              const mine = tabs.find((tab) => tab.kind === 'overleaf-source' && tab.contentId === address);
              const editor = tabs.find((tab) => tab.kind === 'editor' && tab.contentId === address);
              if (editor !== undefined) {
                // Keep exactly one editable tab, in the pane where that file
                // already lived: drop a duplicate of ours, then take (or
                // replace) the generic editor's slot.
                if (mine !== undefined) sidebar.closeIn?.(sessionId, mine.id);
                options.replaceTab = editor.id;
              }
            } catch { /* placement still works without the hint */ }
            // The PDF split is the normal case; without one, the source splits
            // the files pane instead. A restored tab in that pane is moved by
            // `arrangePanes` after it opens.
            if (options.replaceTab === undefined && visibleDockPanes().length < 2) options.preferNewPane = true;
            // Last, so opening the PDF cannot steal focus from the editor.
            const opened = await attempt(() => sidebar.openResource(address, options));
            if (!opened) await attempt(() => sidebar.openResource(address));
          }
          await arrangePanes(sessionId, sidebar);
          // A restored split can seed its files page a render after the tabs
          // arrive; clean up once more after the layout settles.
          await wait(400);
          pruneEditorPanes(sessionId, sidebar);
          await wait(600);
          pruneEditorPanes(sessionId, sidebar);
          // The file tree is the left column; the project list would be a
          // fourth one. It comes back when the project is left.
          sidebarSection?.collapseSidebar();
          sidebarSection?.refreshLayout();
        }

        /** Open a workspace record from the panel or sidebar section, registering it when needed. */
        async function openRecord(record, options = {}) {
          // Opening an already registered directory is idempotent on the host and
          // restarts live sync after a Harness restart; skipping it here left an
          // existing workspace entered without its realtime session.
          const opened = await api('open', { base_url: record.server, project_id: record.projectId,
            project_name: record.projectName, local_path: record.localDir });
          const workspaceId = opened.workspaceId ?? workspaceIdFor(record.localDir);
          if (workspaceId === undefined) throw new Error('工作区尚未就绪，请稍后重试。');
          await enterWorkspace(workspaceId, record.localDir, options);
        }

        /**
         * The built-in file tree opens a file in whichever dock pane is active.
         * Clicking a row makes the tree's pane active, which would put the file
         * back into the directory column. Focus the editor pane in the capture
         * phase instead, before the tree's own click handler runs.
         */
        const installFilePaneGuard = () => {
          let focusTimer;
          const onClick = (event) => {
            const target = event.target instanceof Element ? event.target : undefined;
            // The built-in tree exposes `data-files-path` on its rows; the
            // alternate explorer uses a button with an absolute `title`.
            const row = target?.closest('[data-files-path], [role="button"][title]');
            if (row === null || row === undefined) return;
            const path = row.getAttribute('data-files-path') ?? row.getAttribute('title') ?? '';
            const entry = row.getAttribute('data-files-entry');
            const name = path.split('/').pop() ?? '';
            // Folders toggle in place; only actual files leave the column.
            if (entry === 'folder') return;
            if (entry === undefined
              && (name.length === 0 || !name.includes('.') || String(row.className).includes('explorerDir'))) return;
            if (entry === 'file' && name.length === 0) return;
            const pane = row.closest('[data-dockkit-pane]');
            if (pane === null) return;
            const service = sidebarService();
            const sessionId = service?.mounted?.getSnapshot?.();
            if (typeof sessionId !== 'string' || !isKnownSession(sessionId)) return;
            const tabs = service.tabsIn?.(sessionId) ?? [];
            const filesTab = tabs.find((tab) => tab.kind === 'files');
            if (filesTab === undefined || paneOfTab(filesTab.id) !== pane) return;
            const beforeIds = new Set(tabs.filter((tab) => tab.kind !== 'files' && tab.kind !== 'guide')
              .map((tab) => tab.id));
            const editorTab = tabs.find((tab) => tab.kind !== 'files' && tab.kind !== 'guide'
              && paneOfTab(tab.id) !== undefined && paneOfTab(tab.id) !== pane);
            const editorPaneId = editorTab === undefined ? undefined : paneOfTab(editorTab.id)?.dataset.dockkitPane;
            // Focus first, so a tree whose rows ask the controller to open the
            // resource lands in the editor pane rather than the tree pane.
            if (editorTab !== undefined) {
              try { service.focus?.(editorTab.id); } catch { /* the tree's own open still works */ }
            }
            // Some trees (and an empty editor pane) ignore that; after the
            // tree's handler has run, move whatever landed in the tree pane.
            clearTimeout(focusTimer);
            focusTimer = setTimeout(() => { void (async () => {
              const current = sidebarService();
              if (current === undefined || current.mounted?.getSnapshot?.() !== sessionId) return;
              const filesPane = paneOfTab(filesTab.id);
              if (filesPane === undefined) return;
              const nowTabs = current.tabsIn?.(sessionId) ?? [];
              const landed = nowTabs.filter((tab) => tab.kind !== 'files' && tab.kind !== 'guide'
                && paneOfTab(tab.id) === filesPane && !beforeIds.has(tab.id));
              if (landed.length > 0) {
                const panes = visibleDockPanes();
                let editorPane = panes.find((candidate) => candidate !== filesPane);
                if (editorPane === undefined) {
                  const actions = findPaneActions(sessionId);
                  if (actions?.splitPane !== undefined && filesPane.dataset.dockkitPane !== undefined) {
                    try { actions.splitPane(sessionId, filesPane.dataset.dockkitPane); } catch { /* no room */ }
                    await wait(350);
                    editorPane = visibleDockPanes().find((candidate) => candidate !== paneOfTab(filesTab.id));
                  }
                }
                if (editorPane !== undefined) {
                  const actions = findPaneActions(sessionId);
                  for (const tab of landed) {
                    try { actions?.placeTab?.(sessionId, tab.id, editorPane.dataset.dockkitPane); } catch { /* leave it */ }
                  }
                  await wait(120);
                  const split = paneOfTab(filesTab.id)?.closest('[data-dockkit-split]');
                  if (split !== null && split !== undefined && actions?.resizeSplit !== undefined) {
                    try {
                      actions.resizeSplit(sessionId, split.dataset.dockkitSplit,
                        [FILES_PANE_RATIO, 1 - FILES_PANE_RATIO]);
                    } catch { /* keep the default split */ }
                  }
                  try { current.focus?.(landed[landed.length - 1].id); } catch { /* keep */ }
                  pruneEditorPanes(sessionId, current);
                }
                return;
              }
              // No move was needed: keep the caret on the editor tab the tree
              // selected, instead of leaving focus in the directory pane.
              const editorPane = editorPaneId === undefined ? undefined : visibleDockPanes()
                .find((candidate) => candidate.dataset.dockkitPane === editorPaneId);
              const selected = editorPane?.querySelector('[data-dockkit-tab][aria-selected="true"]');
              const tabId = selected?.getAttribute('data-dockkit-tab');
              if (tabId === null || tabId === undefined) return;
              try { current.focus?.(tabId); } catch { /* keep the selection */ }
            })(); }, 120);
          };
          document.addEventListener('click', onClick, true);
          return () => {
            clearTimeout(focusTimer);
            document.removeEventListener('click', onClick, true);
          };
        };
        ctx.effect(() => installFilePaneGuard(), 'dsh-overleaf: file rows open in the editor pane');

        let sidebarSection;
        ctx.effect(() => {
          sidebarSection = installOverleafSidebar(ctx, api, PANEL, openRecord);
          return () => { sidebarSection?.dispose(); sidebarSection = undefined; };
        });

        // `.tex` & friends inside an Overleaf workspace open in the editable tab;
        // the same extensions elsewhere keep the harness's read-only preview.
        const registerSourceTab = (tabsCtx) => {
          try {
            // Effects stay on this plugin's own context; only the service lookup
            // uses the scoped one that waited for `sidebarRightTabs`.
            ctx.effect(() => tabsCtx.sidebarRightTabs.register({
              id: 'dsh-overleaf/source',
              kind: 'overleaf-source',
              // Naming the whole address makes these patterns longer than a
              // generic editor's catch-all, which wins the registry's tie-break
              // (priority, matched-pattern length, registration order). Without
              // it another sidebar editor claims `.tex` first and the Overleaf
              // compile/end controls never appear.
              patterns: ['tex', 'bib', 'sty', 'cls', 'def', 'tikz', 'pgf', 'ltx', 'clo', 'ins', 'bst']
                .map((extension) => `dsh-resource://file/session/**/*.${extension}`),
              priority: 'extension',
              canOpen: canOpenSource,
              title: (address) => basenameOf(parseFileAddress(address)?.path ?? address),
            }), 'dsh-overleaf: source tab type');
            ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
              name: 'sidebar.right.pane.tab',
              key: 'dsh-overleaf/source',
              inject: () => ({ api }),
            }, SourceTab)), 'dsh-overleaf: source tab body');
          } catch (error) {
            noteSetupError('右侧栏标签页注册失败', error);
          }
        };
        if (typeof ctx.inject === 'function') {
          try { ctx.inject(['sidebarRightTabs'], registerSourceTab); }
          catch (error) { noteSetupError('右侧栏服务不可用', error); }
        } else {
          noteSetupError('右侧栏服务不可用', new Error('客户端上下文缺少 inject()'));
        }

        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL,
          inject: () => ({ services: { ctx, api, enterWorkspace, openRecord } }) }, OverleafPanel));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist',
          id: PANEL, order: -9, label: 'Overleaf' }, Icon));
      },
    };
  },
});
