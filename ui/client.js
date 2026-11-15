/* Native Harness client bundle. React and services come from its module loader. */
window.__ModuleLoader__.load({
  id: 'dsh-overleaf-workshop',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useCallback, useRef, useLayoutEffect, useImperativeHandle, useSyncExternalStore, forwardRef } = React;
    const PANEL = 'overleaf';
    const POLL_MS = 1500;
    const removedWorkspaceSessions = new Map();

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
      .dsh-ol-files-inner{position:relative;min-height:100%}
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

    /**
     * CodeMirror shell shared by the sidebar source tab and the panel editor.
     * DSH exposes the user's chosen code font family, and its body text size as
     * CSS variables on body; the editor follows that text size rather than the
     * separate code-block size so it matches the size selected in Settings.
     */
    const EDITOR_CSS = `
      .dsh-ol-cm-wrap{display:flex;flex:1;min-width:0;min-height:0;position:relative}
      .dsh-ol-cm{flex:1;min-width:0;min-height:0;overflow:hidden;overscroll-behavior:contain}
      .dsh-ol-cm .cm-editor{height:100%;background:transparent;color:var(--dsw-alias-label-primary,CanvasText);font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,monospace);font-size:var(--dsh-content-font-size,var(--dsh-code-font-size,12px));overscroll-behavior:contain}
      .dsh-ol-cm .cm-editor.cm-focused{outline:none}
      .dsh-ol-cm .cm-scroller{font-family:inherit;line-height:calc(22px + var(--dsh-content-font-delta,0px));overflow:auto}
      .dsh-ol-cm .cm-content{font-family:inherit;tab-size:2}
      .dsh-ol-cm .cm-gutters{background:transparent;border-right:1px solid color-mix(in srgb,currentColor 9%,transparent)}
      .dsh-ol-cm .cm-lineNumbers .cm-gutterElement{color:color-mix(in srgb,currentColor 38%,transparent);padding:0 8px 0 4px}
      .dsh-ol-cm .cm-foldGutter{width:14px;color:var(--dsw-alias-link,#89B4FA)}
      .dsh-ol-cm .cm-tooltip-autocomplete{z-index:30;background:Canvas;color:CanvasText;border:1px solid color-mix(in srgb,currentColor 16%,transparent);box-shadow:0 8px 24px #0003}
      /* Token colors follow the Harness palette; comments stay a muted gray. */
      .dsh-ol-cm .cm-ol-keyword{color:var(--dsw-alias-state-idle-primary,#CBA6F7)}
      .dsh-ol-cm .cm-ol-tag,.dsh-ol-cm .cm-ol-builtin{color:var(--dsw-alias-link,#89B4FA)}
      .dsh-ol-cm .cm-ol-string,.dsh-ol-cm .cm-ol-atom{color:var(--dsw-alias-state-success-primary,#A6E3A1)}
      .dsh-ol-cm .cm-ol-number{color:var(--dsw-alias-state-warn-primary,#F9E2AF)}
      .dsh-ol-cm .cm-ol-invalid{color:var(--dsw-alias-state-error-primary,#F38BA8)}
      .dsh-ol-cm .cm-ol-comment{color:#6C7086;font-style:italic}
      body[data-ds-dark-theme] .dsh-ol-cm .cm-ol-comment{color:#7F849C}
      .dsh-ol-cm .cm-searching{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#F9E2AF) 30%,transparent)}
      .dsh-ol-cm .cm-panels{background:var(--dsw-alias-markdown-code-block-banner,#11111B);color:var(--dsw-alias-label-primary,CanvasText);border-color:color-mix(in srgb,currentColor 10%,transparent)}
      .dsh-ol-cm .cm-panels-top{border-bottom:1px solid color-mix(in srgb,currentColor 10%,transparent)}
      .dsh-ol-cm .cm-panels-bottom{border-top:1px solid color-mix(in srgb,currentColor 10%,transparent)}
      .dsh-ol-cm .cm-panel.cm-search{display:flex;flex-wrap:wrap;align-items:center;gap:5px;padding:7px 38px 7px 12px;font-family:var(--ds-font-family-ui,inherit);font-size:12px;line-height:1.4}
      .dsh-ol-cm .cm-panel.cm-search br{display:none}
      .dsh-ol-cm .cm-panel.cm-search input,.dsh-ol-cm .cm-panel.cm-search button,.dsh-ol-cm .cm-panel.cm-search label{margin:0}
      .dsh-ol-cm .cm-panel.cm-search .cm-textfield{box-sizing:border-box;flex:0 1 180px;min-width:110px;height:28px;padding:3px 8px;border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:6px;outline:none;background:color-mix(in srgb,currentColor 5%,transparent);color:var(--dsw-alias-label-primary,CanvasText);font:inherit;font-size:12px}
      .dsh-ol-cm .cm-panel.cm-search .cm-textfield::placeholder{color:var(--dsw-alias-label-secondary,GrayText);opacity:.75}
      .dsh-ol-cm .cm-panel.cm-search .cm-textfield:focus{border-color:var(--dsw-alias-link,#89B4FA);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-link,#89B4FA) 16%,transparent)}
      .dsh-ol-cm .cm-panel.cm-search .cm-button{height:28px;padding:3px 9px;border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:6px;background:color-mix(in srgb,currentColor 5%,transparent);color:var(--dsw-alias-label-primary,CanvasText);font:inherit;font-size:11.5px;cursor:pointer}
      .dsh-ol-cm .cm-panel.cm-search .cm-button:hover{background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,currentColor 8%,transparent));border-color:color-mix(in srgb,currentColor 20%,transparent)}
      .dsh-ol-cm .cm-panel.cm-search label{display:inline-flex;align-items:center;gap:4px;min-height:28px;color:var(--dsw-alias-label-secondary,GrayText);font-size:11px;white-space:nowrap;cursor:pointer;user-select:none}
      .dsh-ol-cm .cm-panel.cm-search input[type=checkbox]{width:13px;height:13px;margin:0;accent-color:var(--dsw-alias-link,#89B4FA)}
      .dsh-ol-cm .cm-panel.cm-search button[name=close]{top:7px;right:8px;width:26px;height:26px;border-radius:6px;color:var(--dsw-alias-label-secondary,GrayText);font-size:18px;line-height:24px}
      .dsh-ol-cm .cm-panel.cm-search button[name=close]:hover{background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,currentColor 8%,transparent));color:var(--dsw-alias-label-primary,CanvasText)}
      .dsh-ol-cm .cm-searchMatch{background:color-mix(in srgb,var(--dsw-alias-link,#89B4FA) 22%,transparent);outline:1px solid color-mix(in srgb,var(--dsw-alias-link,#89B4FA) 30%,transparent)}
      .dsh-ol-cm .cm-searchMatch-selected{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#F9E2AF) 32%,transparent);outline-color:var(--dsw-alias-state-warn-primary,#F9E2AF)}
      .dsh-ol-cm-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;opacity:.5;pointer-events:none}
      .dsh-ol-cm-fallback{flex:1;min-height:0;width:100%;box-sizing:border-box;border:0;outline:none;resize:none;background:transparent;color:inherit;font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,monospace);font-size:var(--dsh-content-font-size,var(--dsh-code-font-size,12px));line-height:calc(22px + var(--dsh-content-font-delta,0px));padding:6px 12px 14px;tab-size:2;white-space:pre;overflow:auto}
      .dsh-ol-cm-panel{min-height:480px;height:60vh;display:flex}
      .dsh-ol-fa{display:flex;align-items:center;gap:4px;flex:none}
      .dsh-ol-fa>button{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,GrayText);cursor:pointer}
      .dsh-ol-fa>button:hover{background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,currentColor 8%,transparent));color:var(--dsw-alias-label-primary,CanvasText)}
      .dsh-ol-fa>button:focus-visible{outline:1px solid var(--dsw-alias-link,#89B4FA);outline-offset:-1px}
      .dsh-ol-fa>button>svg{display:block;width:15px;height:15px}
      .dsh-ol-fa-dialog{width:380px;max-width:calc(100vw - 32px);box-sizing:border-box;border:1px solid var(--dsw-alias-border-l3,color-mix(in srgb,currentColor 16%,transparent));border-radius:12px;padding:18px;background:Canvas;color:CanvasText;font:inherit;box-shadow:0 18px 50px #0004}
      .dsh-ol-fa-dialog::backdrop{background:#0006;backdrop-filter:blur(2px)}
      .dsh-ol-fa-dialog form{display:flex;flex-direction:column;gap:10px}
      .dsh-ol-fa-title{font-size:14px;font-weight:650}
      .dsh-ol-fa-sub{font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,monospace);font-size:10.5px;opacity:.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dsh-ol-fa-dialog input{width:100%;box-sizing:border-box;height:36px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:7px;background:transparent;color:inherit;padding:0 10px;font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,monospace);font-size:12px;outline:none}
      .dsh-ol-fa-dialog input:focus{border-color:#5684ec;box-shadow:0 0 0 3px #5684ec22}
      .dsh-ol-fa-error{color:#c34c4c;font-size:11.5px;line-height:1.5;overflow-wrap:anywhere}
      .dsh-ol-fa-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:2px}
      .dsh-ol-fa-actions button{font:inherit;font-size:12px;cursor:pointer;border-radius:7px;min-height:30px;padding:5px 12px;border:1px solid color-mix(in srgb,currentColor 15%,transparent);color:inherit;background:transparent}
      .dsh-ol-fa-actions button:hover:not(:disabled){background:color-mix(in srgb,currentColor 7%,transparent)}
      .dsh-ol-fa-actions button:disabled{opacity:.5;cursor:default}
      .dsh-ol-fa-actions button.primary{color:#fff;background:#138a59;border-color:#138a59}
    `;

    /** Compact the host file tree only while it is an Overleaf workspace column. */
    const FILE_TREE_CSS = `
      .dsh-ol-flipped [data-files-root]>div:first-child{min-height:40px;box-sizing:border-box;padding:0 8px 0 12px;gap:4px;border-bottom:1px solid color-mix(in srgb,currentColor 9%,transparent)}
      .dsh-ol-flipped [data-files-root]>div:first-child::before{content:'项目文件';flex:1;min-width:0;color:var(--dsw-alias-label-primary,CanvasText);font-size:12px;font-weight:600;line-height:28px}
      .dsh-ol-flipped [data-files-root]>div:first-child>[data-path-label]{display:none}
      .dsh-ol-flipped [data-files-root]>div:first-child button[data-files-reload]{flex:none;width:28px;height:28px;padding:6px;border-radius:6px;color:var(--dsw-alias-label-secondary,GrayText)}
      .dsh-ol-flipped [data-files-root]>div:first-child button[data-files-reload]:hover{background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,currentColor 8%,transparent));color:var(--dsw-alias-label-primary,CanvasText)}
      .dsh-ol-flipped [data-files-root]>div:first-child>span:last-child{flex:none;align-items:center;height:28px;box-sizing:border-box;border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:6px;overflow:hidden}
      .dsh-ol-flipped [data-files-root]>div:first-child>span:last-child button{box-sizing:border-box;height:26px;border-radius:0;color:var(--dsw-alias-label-secondary,GrayText)}
      .dsh-ol-flipped [data-files-root]>div:first-child>span:last-child button:hover{background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,currentColor 8%,transparent));color:var(--dsw-alias-label-primary,CanvasText)}
      .dsh-ol-flipped [data-files-root] li[data-files-entry]>button{display:flex;align-items:center;min-height:30px;padding:4px 8px;border-radius:7px;color:var(--dsw-alias-label-primary,CanvasText);font-size:12.5px;line-height:20px;transition:background-color .12s ease,color .12s ease}
      .dsh-ol-flipped [data-files-root] li[data-files-entry]>button:hover{background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,currentColor 7%,transparent))}
      .dsh-ol-flipped [data-files-root] li[data-files-entry]>button:focus-visible{outline:1px solid var(--dsw-alias-link,#89B4FA);outline-offset:-1px}
      .dsh-ol-flipped [data-files-root] li[data-files-entry]>button>svg:not([data-dsh-file-icon]){display:none}
      .dsh-ol-flipped [data-files-root] li[data-files-entry]>button>[data-dsh-file-icon]{display:inline-flex;align-items:center;justify-content:center;flex:none;width:19px;height:20px;margin-right:7px;color:var(--dsw-alias-label-secondary,GrayText)}
      .dsh-ol-flipped [data-files-root] li[data-files-entry]>button>[data-dsh-file-icon] svg{display:block;width:18px;height:18px;overflow:visible}
      .dsh-ol-flipped [data-files-root] li[data-files-entry][data-dsh-file-kind=folder]>button>[data-dsh-file-icon]{color:var(--dsw-alias-state-idle-primary,#CBA6F7)}
      .dsh-ol-flipped [data-files-root] li[data-files-entry][data-dsh-file-kind=tex]>button>[data-dsh-file-icon],
      .dsh-ol-flipped [data-files-root] li[data-files-entry][data-dsh-file-kind=bib]>button>[data-dsh-file-icon]{color:var(--dsw-alias-link,#89B4FA)}
      .dsh-ol-flipped [data-files-root] li[data-files-entry][data-dsh-file-kind=sty]>button>[data-dsh-file-icon]{color:var(--dsw-alias-state-idle-primary,#CBA6F7)}
      .dsh-ol-flipped [data-files-root] li[data-files-entry][data-dsh-file-kind=pdf]>button>[data-dsh-file-icon]{color:var(--dsw-alias-state-error-primary,#F38BA8)}
      .dsh-ol-flipped [data-files-root] li[data-files-entry][data-dsh-file-kind=image]>button>[data-dsh-file-icon]{color:var(--dsw-alias-state-success-primary,#A6E3A1)}
      .dsh-ol-flipped [data-files-root] li[data-files-entry][data-dsh-file-kind=log]>button>[data-dsh-file-icon]{color:var(--dsw-alias-state-warn-primary,#F9E2AF)}
      .dsh-ol-flipped [data-files-root] li[data-files-entry][data-dsh-file-kind=folder][data-dsh-expanded=true]>button>[data-dsh-file-icon]{color:var(--dsw-alias-link,#89B4FA)}
      .dsh-ol-flipped [data-files-root] li[data-files-entry][data-dsh-file-kind=folder]>button{font-weight:570}
      .dsh-ol-flipped [data-files-root] li[data-files-entry][data-dsh-file-kind=folder][data-dsh-expanded=true]>button{color:var(--dsw-alias-label-primary,CanvasText)}
      .dsh-ol-flipped [data-files-root] li[data-files-entry][data-dsh-selected=true]>button{background:color-mix(in srgb,var(--dsw-alias-state-idle-primary,#CBA6F7) 13%,transparent);color:var(--dsw-alias-label-primary,CanvasText)}
      .dsh-ol-flipped [data-files-root] li[data-files-entry][data-dsh-selected=true]>button>[data-dsh-file-icon]{filter:saturate(1.08)}
      @media (prefers-reduced-motion:reduce){.dsh-ol-flipped [data-files-root] li[data-files-entry]>button{transition:none}}
      .dsh-ol-tree-menu{position:fixed;z-index:1000;min-width:168px;padding:5px;border:1px solid var(--dsw-alias-border-l3,color-mix(in srgb,currentColor 16%,transparent));border-radius:9px;background:var(--dsw-alias-bg-elevated,Canvas);color:var(--dsw-alias-label-primary,CanvasText);box-shadow:0 12px 30px #0005;font-size:12px}
      .dsh-ol-tree-menu button{display:flex;align-items:center;gap:8px;width:100%;min-height:30px;padding:5px 8px;border:0;border-radius:6px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
      .dsh-ol-tree-menu button:hover,.dsh-ol-tree-menu button:focus-visible{background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,currentColor 8%,transparent));outline:none}
      .dsh-ol-tree-menu button>[data-dsh-file-icon]{width:18px;height:18px;color:var(--dsw-alias-label-secondary,GrayText)}
      .dsh-ol-tree-menu button>[data-dsh-file-icon] svg{display:block;width:17px;height:17px}
      .dsh-ol-tree-menu button[data-dsh-create-kind=file]>[data-dsh-file-icon]{color:var(--dsw-alias-link,#89B4FA)}
      .dsh-ol-tree-menu button[data-dsh-create-kind=folder]>[data-dsh-file-icon]{color:var(--dsw-alias-state-idle-primary,#CBA6F7)}
    `;

    const FILE_TREE_ICON_NS = 'http://www.w3.org/2000/svg';
    const FILE_TREE_EXTENSIONS = {
      tex: 'tex', ltx: 'tex', clo: 'tex', ins: 'tex',
      bib: 'bib', bst: 'bib',
      sty: 'sty', cls: 'sty', def: 'sty', tikz: 'sty', pgf: 'sty',
      pdf: 'pdf', log: 'log',
      png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', svg: 'image',
      webp: 'image', eps: 'image', tif: 'image', tiff: 'image',
    };

    function fileTreeKind(row) {
      if (row.getAttribute('data-files-entry') === 'directory'
        || row.getAttribute('data-files-entry') === 'folder') return 'folder';
      const path = String(row.getAttribute('data-files-path') ?? '').replace(/\\/g, '/');
      const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
      const dot = name.lastIndexOf('.');
      return dot < 0 ? 'file' : FILE_TREE_EXTENSIONS[name.slice(dot + 1)] ?? 'file';
    }

    function appendSvgPath(svg, d, options = {}) {
      const path = document.createElementNS(FILE_TREE_ICON_NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', options.fill ?? 'none');
      path.setAttribute('stroke', options.stroke ?? 'currentColor');
      path.setAttribute('stroke-width', options.width ?? '1.55');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      svg.append(path);
    }

    function normalizeTreePath(value) {
      return String(value ?? '').replace(/\\/g, '/').replace(/\/+/gu, '/').replace(/^\.\//u, '').replace(/\/+$/u, '');
    }

    function relativeTreePath(rootValue, absoluteValue) {
      const root = normalizeTreePath(rootValue);
      const absolute = normalizeTreePath(absoluteValue);
      if (root.length === 0 || absolute === root) return absolute === root ? '' : undefined;
      return absolute.startsWith(`${root}/`) ? absolute.slice(root.length + 1) : undefined;
    }

    function creationDirectory(rootValue, row) {
      if (row === undefined || row === null) return '';
      const relative = relativeTreePath(rootValue, row.getAttribute('data-files-path'));
      if (relative === undefined) return undefined;
      const entry = row.getAttribute('data-files-entry');
      if (entry === 'directory' || entry === 'folder') return relative;
      const slash = relative.lastIndexOf('/');
      return slash < 0 ? '' : relative.slice(0, slash);
    }

    function makeFileTreeIcon(kind, expanded) {
      const holder = document.createElement('span');
      holder.setAttribute('data-dsh-file-icon', '');
      holder.setAttribute('aria-hidden', 'true');
      const svg = document.createElementNS(FILE_TREE_ICON_NS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      if (kind === 'folder') {
        appendSvgPath(svg, expanded
          ? 'M3 7.5a2 2 0 0 1 2-2h4.2l1.7 2H21a1.5 1.5 0 0 1 1.4 2L20 17.8a2 2 0 0 1-1.9 1.4H4.5a2 2 0 0 1-2-2z'
          : 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z');
        if (expanded) appendSvgPath(svg, 'M4 10h17.6', { width: '1.2' });
      } else if (kind === 'image') {
        appendSvgPath(svg, 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z');
        appendSvgPath(svg, 'm5 17 4-4 3 3 2-2 5 5M8 9.2h.01');
      } else {
        appendSvgPath(svg, 'M6 3.5h8l4 4v13H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z');
        appendSvgPath(svg, 'M14 3.5v4h4', { width: '1.2' });
        if (kind === 'pdf') appendSvgPath(svg, 'M7.5 16h7.5M7.5 18.5h5', { width: '1.2' });
        else if (kind === 'log') appendSvgPath(svg, 'M7.5 12h7M7.5 15h7M7.5 18h4', { width: '1.2' });
        else if (kind === 'bib') appendSvgPath(svg, 'M8 12h.01M8 15h.01M8 18h.01M10.5 12h4.5M10.5 15h4.5M10.5 18h3', { width: '1.2' });
        else if (kind === 'tex') appendSvgPath(svg, 'M8 12h6M8 15h4M8 18h6', { width: '1.2' });
        else if (kind === 'sty') appendSvgPath(svg, 'M8 13h6M8 16h4', { width: '1.2' });
      }
      holder.append(svg);
      return holder;
    }

    function decorateFileTreeRows() {
      document.querySelectorAll('.dsh-ol-flipped [data-files-root] li[data-files-entry]').forEach((row) => {
        const button = row.querySelector(':scope > button');
        if (button === null) return;
        const kind = fileTreeKind(row);
        const expanded = button.getAttribute('aria-expanded') === 'true'
          || row.getAttribute('aria-expanded') === 'true';
        const selected = button.getAttribute('aria-current') === 'page'
          || button.getAttribute('aria-selected') === 'true'
          || row.classList.contains('selected')
          || row.classList.contains('active');
        row.dataset.dshFileKind = kind;
        row.dataset.dshExpanded = expanded ? 'true' : 'false';
        row.dataset.dshSelected = selected ? 'true' : 'false';
        const existing = button.querySelector(':scope > [data-dsh-file-icon]');
        if (existing !== null
          && existing.dataset.dshFileIconKind === kind
          && existing.dataset.dshFileIconExpanded === (expanded ? 'true' : 'false')) return;
        if (existing !== null) existing.remove();
        const icon = makeFileTreeIcon(kind, expanded);
        icon.dataset.dshFileIconKind = kind;
        icon.dataset.dshFileIconExpanded = expanded ? 'true' : 'false';
        button.prepend(icon);
      });
    }

    /** The sidebar region: same DOM-section technique as dsh-remote-ssh. */
    const SIDEBAR_CSS = `
      .dsh-ol-sb{flex:none;display:flex;flex-direction:column;min-width:0;margin-top:12px;padding:0;border:0}
      .dsh-ol-native-hidden{display:none!important}
      .dsh-overleaf-flat-workspace-menu [data-context-menu] [role=separator]{display:none}
      .dsh-ol-sb-head{display:flex;align-items:center;gap:4px;min-height:36px;font:inherit;font-size:14px;font-weight:400;line-height:20px;color:var(--dsw-alias-label-tertiary,inherit)}
      .dsh-ol-sb-section-toggle{position:relative;display:flex;align-items:center;flex:1;min-width:0;height:28px;box-sizing:border-box;border:0;background:none;color:inherit;font:inherit;font-size:14px;font-weight:400;line-height:20px;text-align:left;padding:4px 0;cursor:pointer;opacity:1}
      .dsh-ol-sb-section-toggle>span{position:relative;left:-1px}
      .dsh-ol-sb-section-toggle svg{position:absolute;left:-17px;width:14px;height:14px;transition:transform .12s}
      .dsh-ol-sb-section-toggle[aria-expanded=true] svg{transform:rotate(90deg)}
      .dsh-ol-sb-body{flex:none;min-width:0;padding:2px 0 6px}
      .dsh-ol-sb-row{box-sizing:border-box;display:flex;align-items:center;gap:6px;position:relative;width:100%;height:32px;padding:0 8px 0 9px;border:0;border-radius:12px;background:none;color:inherit;font:inherit;font-size:14px;cursor:pointer;min-width:0;outline:none}
      .dsh-ol-sb-row:hover,.dsh-ol-sb-row:focus-visible,.dsh-ol-sb-row.menu-open{background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,currentColor 8%,transparent))}
      .dsh-ol-sb-leading{position:relative;display:grid;place-items:center;flex:none;width:16px;height:24px;padding:0;border:0;background:none;color:var(--dsw-alias-label-secondary,inherit);cursor:pointer}
      .dsh-ol-sb-leading>svg{width:16px;height:16px}
      .dsh-ol-sb-leading .dsh-ol-sb-arrow{display:none;width:14px;height:14px}
      .dsh-ol-sb-leading[aria-expanded=true] .dsh-ol-sb-arrow{transform:rotate(90deg)}
      .dsh-ol-sb-row:hover .dsh-ol-sb-folder,.dsh-ol-sb-row:focus-within .dsh-ol-sb-folder{display:none}
      .dsh-ol-sb-row:hover .dsh-ol-sb-arrow,.dsh-ol-sb-row:focus-within .dsh-ol-sb-arrow{display:block}
      .dsh-ol-sb-status{position:absolute;right:-2px;bottom:3px;width:5px;height:5px;border-radius:50%;background:#8a8f98;box-shadow:0 0 0 2px var(--dsw-alias-background-primary,#1e1e2e)}
      .dsh-ol-sb-status.connected{background:#86efac}.dsh-ol-sb-status.connecting,.dsh-ol-sb-status.reconnecting{background:#e2b93b}.dsh-ol-sb-status.error{background:#e56767}
      .dsh-ol-sb-title{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dsh-ol-sb-row>.dsh-ol-sb-title{flex:1}
      .dsh-ol-sb-row:hover>.dsh-ol-sb-title,.dsh-ol-sb-row:focus-within>.dsh-ol-sb-title,.dsh-ol-sb-row.menu-open>.dsh-ol-sb-title{padding-right:78px}
      .dsh-ol-sb-actions{position:absolute;right:8px;display:flex;align-items:center;gap:2px;opacity:0;pointer-events:none}
      .dsh-ol-sb-row:hover .dsh-ol-sb-actions,.dsh-ol-sb-row:focus-within .dsh-ol-sb-actions,.dsh-ol-sb-row.menu-open .dsh-ol-sb-actions{opacity:1;pointer-events:auto}
      .dsh-ol-sb-icon{display:grid;place-items:center;flex:none;width:24px;height:24px;padding:0;border:0;border-radius:4px;background:none;color:var(--dsw-alias-label-secondary,inherit);font:inherit;cursor:pointer;opacity:.75}
      .dsh-ol-sb-icon svg{width:16px;height:16px}
      .dsh-ol-sb-icon:hover,.dsh-ol-sb-icon:focus-visible{opacity:1;background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,currentColor 9%,transparent));outline:none}
      .dsh-ol-sb-icon:disabled{opacity:.3;cursor:default}.dsh-ol-sb-icon.connected{color:#86efac}
      .dsh-ol-sb-sessions{display:flex;flex-direction:column;gap:0;margin:2px 0 4px;min-width:0}
      .dsh-ol-sb-session{position:relative;box-sizing:border-box;display:flex;align-items:center;gap:8px;width:100%;height:32px;padding:0 8px 0 34px;border:0;border-radius:12px;background:none;color:inherit;font:inherit;font-size:14px;text-align:left;cursor:pointer;min-width:0}
      .dsh-ol-sb-session .dsh-ol-sb-title{flex:1}
      .dsh-ol-sb-session-actions{position:absolute;right:8px;display:flex;align-items:center;opacity:0;pointer-events:none}
      .dsh-ol-sb-session:hover .dsh-ol-sb-session-actions,.dsh-ol-sb-session:focus-within .dsh-ol-sb-session-actions,.dsh-ol-sb-session.menu-open .dsh-ol-sb-session-actions{opacity:1;pointer-events:auto}
      .dsh-ol-sb-session:hover .dsh-ol-sb-time,.dsh-ol-sb-session:focus-within .dsh-ol-sb-time,.dsh-ol-sb-session.menu-open .dsh-ol-sb-time{visibility:hidden}
      .dsh-ol-sb-session:hover .dsh-ol-sb-title,.dsh-ol-sb-session:focus-within .dsh-ol-sb-title,.dsh-ol-sb-session.menu-open .dsh-ol-sb-title{padding-right:26px}
      .dsh-ol-sb-time{flex:none;font-size:11px;opacity:.55}
      .dsh-ol-sb-session:hover,.dsh-ol-sb-session:focus-visible,.dsh-ol-sb-session.current,.dsh-ol-sb-session.menu-open{background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,currentColor 8%,transparent));outline:none}
      .dsh-ol-sb-note{font-size:11px;line-height:1.5;margin:2px 6px 6px;padding:5px 7px;border-radius:6px;overflow-wrap:anywhere}
      .dsh-ol-sb-note.ok{color:#238155;background:#23815510}.dsh-ol-sb-note.error{color:#e56767;background:#e5676710}
      .dsh-ol-sb-empty{font-size:12px;opacity:.55;padding:8px;line-height:1.6}.dsh-ol-sb-empty button{border:0;background:none;color:inherit;font:inherit;text-decoration:underline;cursor:pointer;padding:0}
      /* Match the native Workspaces row, header and icon metrics. */
      .dsh-ol-sb-head{box-sizing:border-box;height:36px;min-height:36px;padding:0 1px 0 12px}
      .dsh-ol-sb-section-toggle{font-size:14px;line-height:20px}
      .dsh-ol-sb-head>.dsh-ol-sb-icon{width:28px;height:28px;margin:0}
      .dsh-ol-sb-row,.dsh-ol-sb-session{height:32px;border-radius:var(--dsw-radius-md,12px);border-inline:var(--dsh-sidebar-paint-inset,3px) solid transparent;background-clip:padding-box;font-size:14px}
      .dsh-ol-sb-row{padding:0 8px;padding-inline-start:calc(var(--dsh-sidebar-row-padding,12px) - var(--dsh-sidebar-paint-inset,3px));gap:var(--dsh-sidebar-label-gap,6px)}
      .dsh-ol-sb-title{font-size:14px;line-height:20px}
      .dsh-ol-sb-leading{height:20px;width:16px}
      .dsh-ol-sb-row>.dsh-ol-sb-title,.dsh-ol-sb-row:hover>.dsh-ol-sb-title,.dsh-ol-sb-row:focus-within>.dsh-ol-sb-title,.dsh-ol-sb-row.menu-open>.dsh-ol-sb-title{padding-right:0}
      .dsh-ol-sb-actions,.dsh-ol-sb-session-actions{position:static;flex:none;align-items:center;gap:13px;display:none;opacity:1;pointer-events:auto}
      .dsh-ol-sb-actions{height:20px}
      .dsh-ol-sb-row:hover .dsh-ol-sb-actions,.dsh-ol-sb-row:focus-within .dsh-ol-sb-actions,.dsh-ol-sb-row.menu-open .dsh-ol-sb-actions,.dsh-ol-sb-session:hover .dsh-ol-sb-session-actions,.dsh-ol-sb-session:focus-within .dsh-ol-sb-session-actions,.dsh-ol-sb-session.menu-open .dsh-ol-sb-session-actions{display:inline-flex}
      .dsh-ol-sb-icon{display:inline-flex;justify-content:center;align-items:center;width:24px;height:24px;margin:-4px;border-radius:var(--dsw-radius-xs,4px);font-size:13.3333px;opacity:1;color:var(--dsw-alias-label-tertiary,inherit)}
      .dsh-ol-sb-icon svg{width:16px;height:16px}
      .dsh-ol-sb-icon svg[data-icon=dsw-icon-new-chat-outline-regular]{width:14px;height:14px}
      .dsh-ol-sb-session{gap:0;padding:0 8px;padding-inline-start:calc(var(--dsh-sidebar-row-padding,12px) - var(--dsh-sidebar-paint-inset,3px) + 16px + var(--dsh-sidebar-label-gap,6px))}
      .dsh-ol-sb-session .dsh-ol-sb-title{margin-right:6px}
      .dsh-ol-sb-session:hover .dsh-ol-sb-title,.dsh-ol-sb-session:focus-within .dsh-ol-sb-title,.dsh-ol-sb-session.menu-open .dsh-ol-sb-title{padding-right:0}
      .dsh-ol-sb-time{font-size:10px;line-height:16px;color:var(--dsw-alias-label-tertiary,inherit);opacity:1}
      .dsh-ol-sb-session:hover .dsh-ol-sb-time,.dsh-ol-sb-session:focus-within .dsh-ol-sb-time,.dsh-ol-sb-session.menu-open .dsh-ol-sb-time{display:none}
      @media(hover:none){.dsh-ol-sb-actions,.dsh-ol-sb-session-actions{display:inline-flex}.dsh-ol-sb-row>.dsh-ol-sb-title{padding-right:0}}
      .dsh-ol-sb-confirm{width:360px;max-width:calc(100vw - 40px);box-sizing:border-box;padding:24px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:16px;background:var(--dsw-alias-background-secondary,#272735);color:var(--dsw-alias-label-primary,#cdd6f4);font:inherit;box-shadow:0 16px 60px #0006}
      .dsh-ol-sb-confirm::backdrop{background:#0007}.dsh-ol-sb-confirm h2{font-size:17px;font-weight:600;margin:0 0 16px}.dsh-ol-sb-confirm p{font-size:13px;line-height:1.6;overflow-wrap:anywhere}.dsh-ol-sb-confirm-name{font-weight:500}.dsh-ol-sb-confirm-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:24px}.dsh-ol-sb-confirm-actions button{padding:7px 14px;border:1px solid color-mix(in srgb,currentColor 20%,transparent);border-radius:8px;background:none;color:inherit;font:inherit;font-size:13px;cursor:pointer}.dsh-ol-sb-confirm-actions button.danger{background:#c64747;color:white;border-color:#c64747}.dsh-ol-sb-confirm-actions button:disabled{opacity:.5;cursor:default}
      @media(hover:none){.dsh-ol-sb-actions{opacity:1;pointer-events:auto}.dsh-ol-sb-row>.dsh-ol-sb-title{padding-right:78px}}
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
      .dsh-ol-source-workspace{display:flex;flex:1;min-height:0;min-width:0;container-type:inline-size}
      .dsh-ol-source-editor{display:flex;flex-direction:column;flex:1;min-width:0;min-height:0;overflow:hidden}
      .dsh-ol-inline-pdf{display:flex;flex-direction:column;width:45%;min-width:0;min-height:0;border-left:1px solid var(--dsw-alias-border-l3,#45475a)}
      .dsh-ol-inline-pdf-body{flex:1;min-height:0;min-width:0;position:relative;overflow:hidden;display:flex;flex-direction:column}
      .dsh-ol-source-workspace[data-pdf-open=true] .dsh-ol-source-editor{flex-basis:55%}
      .dsh-ol-source-workspace.narrow{flex-direction:column}
      .dsh-ol-source-workspace.narrow .dsh-ol-inline-pdf{width:100%;height:45%;flex:none;border-left:0;border-top:1px solid var(--dsw-alias-border-l3,#45475a)}
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
      .dsh-ol-src-outline{flex:none;max-height:26%;overflow:auto;border-block:1px solid color-mix(in srgb,currentColor 10%,transparent);padding:4px 8px;background:color-mix(in srgb,currentColor 2%,transparent)}
      .dsh-ol-src-outline-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:3px 2px 5px;font-size:11px;font-weight:650;opacity:.72}
      .dsh-ol-src-outline button{display:block;width:100%;border:0;background:none;color:inherit;text-align:left;font:inherit;font-size:11.5px;line-height:1.5;padding:3px 5px;border-radius:4px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dsh-ol-src-outline button:hover{background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,currentColor 7%,transparent))}
      .dsh-ol-src-recovery{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 10px 6px;padding:7px 9px;border-radius:7px;font-size:11.5px;line-height:1.5;color:#a97400;background:#e0a10012;border:1px solid #e0a10033}
      .dsh-ol-src-recovery button{font:inherit;font-size:11px;border:1px solid currentColor;border-radius:5px;background:transparent;color:inherit;padding:2px 7px;cursor:pointer}
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

    /** One persisted PDF visibility preference for every source tab in a workspace. */
    const pdfVisibilityStores = new Map();
    function pdfVisibilityStore(workspace) {
      if (pdfVisibilityStores.has(workspace)) return pdfVisibilityStores.get(workspace);
      const key = `dsh-overleaf:pdf-visible:${encodeURIComponent(String(workspace))}`;
      let visible = true;
      try { visible = localStorage.getItem(key) !== 'false'; } catch { /* Storage is optional. */ }
      const listeners = new Set();
      const store = {
        getSnapshot: () => visible,
        subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
        set: (value) => {
          const next = typeof value === 'function' ? value(visible) : value;
          if (next === visible) return;
          visible = next;
          try { localStorage.setItem(key, String(visible)); } catch { /* Keep the in-memory preference. */ }
          for (const listener of listeners) listener();
        },
      };
      pdfVisibilityStores.set(workspace, store);
      return store;
    }

    const DRAFT_PREFIX = 'dsh-overleaf:draft:';
    const workspaceIndexes = new Map();
    const workspacePollers = new Map();
    const LATEX_SOURCE = /\.(tex|bib|sty|cls|def|tikz|pgf|ltx|clo|ins|bst)$/i;
    const LATEX_COMMANDS = [
      'part', 'chapter', 'section', 'subsection', 'subsubsection', 'paragraph',
      'documentclass', 'usepackage', 'begin', 'end', 'label', 'ref', 'pageref',
      'autoref', 'eqref', 'cite', 'parencite', 'textcite', 'autocite', 'input',
      'include', 'includegraphics', 'bibliography', 'addbibresource', 'item',
      'textbf', 'textit', 'emph', 'underline', 'frac', 'sqrt', 'text', 'caption',
      'footnote', 'url', 'href', 'newcommand', 'renewcommand', 'DeclareMathOperator',
    ];
    const LATEX_ENVIRONMENTS = [
      'document', 'abstract', 'equation', 'equation*', 'align', 'align*', 'gather',
      'gather*', 'multline', 'multline*', 'itemize', 'enumerate', 'description',
      'figure', 'table', 'tabular', 'tabularx', 'thebibliography', 'verbatim',
      'lstlisting', 'tikzpicture', 'matrix', 'cases', 'split', 'minipage',
    ];

    function draftKey(workspace, path) {
      return `${DRAFT_PREFIX}${encodeURIComponent(String(workspace))}:${encodeURIComponent(String(path))}`;
    }
    function readDraft(workspace, path) {
      try {
        const value = JSON.parse(localStorage.getItem(draftKey(workspace, path)) ?? 'null');
        return value && typeof value.text === 'string' && Number.isFinite(value.savedAt) ? value : undefined;
      } catch { return undefined; }
    }
    function writeDraft(workspace, path, value) {
      if (typeof value?.text !== 'string' || value.text.length > 2 * 1024 * 1024) return;
      try { localStorage.setItem(draftKey(workspace, path), JSON.stringify({ ...value, savedAt: Date.now() })); } catch { /* optional */ }
    }
    function clearDraft(workspace, path) {
      try { localStorage.removeItem(draftKey(workspace, path)); } catch { /* optional */ }
    }

    function sourceOutline(text) {
      const result = [];
      const lines = String(text ?? '').split('\n');
      const pattern = /^\s*\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?(?:\s*\[[^\]]*\])?\s*\{([^}]*)\}/;
      const levels = { part: 0, chapter: 1, section: 2, subsection: 3,
        subsubsection: 4, paragraph: 5, subparagraph: 6 };
      lines.forEach((line, index) => {
        const match = pattern.exec(line);
        if (match) result.push({ line: index + 1, level: levels[match[1]], title: match[2].trim(), kind: match[1] });
      });
      return result;
    }

    function addMatches(set, text, pattern, group = 1) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        if (match[group]) set.add(match[group].trim());
      }
    }

    function buildWorkspaceIndex(entries, files) {
      const labels = new Set();
      const citations = new Set();
      const environments = new Set(LATEX_ENVIRONMENTS);
      const commands = new Set(LATEX_COMMANDS);
      const contents = new Map((files ?? []).map((file) => [file.path, file.text]));
      for (const [path, text] of contents) {
        addMatches(labels, text, /\\label\s*\{([^}]+)\}/g);
        addMatches(environments, text, /\\begin\s*\{([^}]+)\}/g);
        addMatches(commands, text, /\\([A-Za-z@]+)\b/g);
        if (/\.bib$/i.test(path)) addMatches(citations, text, /@[A-Za-z]+\s*\{\s*([^,\s]+)/g);
      }
      return { entries: entries ?? [], contents, labels: [...labels].sort(), citations: [...citations].sort(),
        environments: [...environments].sort(), commands: [...commands].sort(), ready: true };
    }

    async function loadWorkspaceIndex(api, workspace, { refresh = false } = {}) {
      const target = typeof workspace === 'string' ? { local_path: workspace } : workspace;
      const localDir = target.local_path ?? `session:${target.session_id}`;
      const previous = workspaceIndexes.get(localDir);
      if (!refresh && previous?.promise !== undefined) return previous.promise;
      if (!refresh && previous?.ready === true) return previous;
      const promise = (async () => {
        const listing = await api('files', target);
        const sourceFiles = listing.entries.filter((entry) => entry.type === 'file' && LATEX_SOURCE.test(entry.path)
          && (entry.size === undefined || entry.size <= 4 * 1024 * 1024)).slice(0, 200);
        let files = [];
        try {
          files = (await api('readFiles', { ...target,
            paths: sourceFiles.map((entry) => entry.path), max_bytes: 8 * 1024 * 1024 })).files;
        } catch { /* File listing still powers the explorer if indexing is unavailable. */ }
        const index = buildWorkspaceIndex(listing.entries, files);
        workspaceIndexes.set(localDir, index);
        return index;
      })();
      workspaceIndexes.set(localDir, { promise });
      try { return await promise; } catch (error) { workspaceIndexes.delete(localDir); throw error; }
    }

    function invalidateWorkspaceIndex(localDir) { workspaceIndexes.delete(localDir); }

    function completionResult(index, cm) {
      if (!index || typeof cm?.getCursor !== 'function') return null;
      const cursor = cm.getCursor();
      const line = cm.getLine(cursor.line) ?? '';
      const before = line.slice(0, cursor.ch);
      const labels = new Set(index.labels);
      const environments = new Set(index.environments);
      const commands = new Set(index.commands);
      const currentText = typeof cm.getValue === 'function' ? cm.getValue() : '';
      addMatches(labels, currentText, /\\label\s*\{([^}]+)\}/g);
      addMatches(environments, currentText, /\\begin\s*\{([^}]+)\}/g);
      addMatches(commands, currentText, /\\([A-Za-z@]+)\b/g);
      const make = (values, token) => {
        const list = [...new Set(values)].filter(Boolean).filter((value) => !token || value.toLowerCase().includes(token.toLowerCase()));
        if (list.length === 0) return null;
        return { list: list.slice(0, 200).map((value) => ({ text: value, displayText: value })),
          from: { line: cursor.line, ch: cursor.ch - token.length }, to: cursor };
      };
      let match;
      match = /\\(?:begin|end)\s*\{([^{}]*)$/u.exec(before);
      if (match) return make(environments, match[1]);
      match = /\\(?:cite|parencite|textcite|autocite)\*?\s*\{([^{}]*)$/u.exec(before);
      if (match) return make(index.citations, match[1].split(',').pop().trim());
      match = /\\(?:ref|pageref|autoref|eqref)\s*\{([^{}]*)$/u.exec(before);
      if (match) return make(labels, match[1]);
      match = /\\(?:input|include|includegraphics|bibliography|addbibresource)\s*\{([^{}]*)$/u.exec(before);
      if (match) {
        const token = match[1].split('/').pop();
        const paths = index.entries.filter((entry) => entry.type === 'file').map((entry) => entry.path)
          .flatMap((path) => [path, path.replace(/\.[^.\/]+$/u, '')]);
        return make(paths, token);
      }
      match = /\\([A-Za-z@]*)$/u.exec(before);
      if (match) return make([...commands].map((command) => `\\${command}`), `\\${match[1]}`);
      return null;
    }

    function subscribeWorkspaceFiles(api, target, path, callback) {
      const key = target.local_path ?? `session:${target.session_id}`;
      let poller = workspacePollers.get(key);
      if (poller === undefined) {
        poller = { api, target, subscribers: new Map(), timer: undefined, busy: false };
        workspacePollers.set(key, poller);
      }
      let listeners = poller.subscribers.get(path);
      if (listeners === undefined) { listeners = new Set(); poller.subscribers.set(path, listeners); }
      listeners.add(callback);
      const poll = async () => {
        if (poller.busy || document.visibilityState !== 'visible' || poller.subscribers.size === 0) return;
        poller.busy = true;
        try {
          const result = await poller.api('readFiles', { ...poller.target, paths: [...poller.subscribers.keys()], max_bytes: 8 * 1024 * 1024 });
          for (const file of result.files) for (const listener of poller.subscribers.get(file.path) ?? []) listener(file);
        } catch { /* The next tick retries after a file write or reconnect. */ }
        finally { poller.busy = false; }
      };
      if (poller.timer === undefined) {
        void poll();
        poller.timer = setInterval(poll, POLL_MS);
      }
      return () => {
        listeners.delete(callback);
        if (listeners.size === 0) poller.subscribers.delete(path);
        if (poller.subscribers.size === 0) {
          clearInterval(poller.timer); poller.timer = undefined; workspacePollers.delete(key);
        }
      };
    }

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

    /**
     * Turn a live status into what the editor should say about one save.
     *
     * The flush RPC returns after two seconds; a slow echo or a reconnect can
     * leave it pending, so callers poll this until the kind is no longer
     * `pending` instead of showing "pushing" forever.
     */
    function pushOutcome(status, path, savedAt) {
      const pushedAt = status?.lastPushAt === undefined ? 0 : Date.parse(status.lastPushAt);
      const failedAt = status?.pushErrorAt === undefined ? 0 : Date.parse(status.pushErrorAt);
      if (status?.pushError && failedAt >= savedAt) {
        return { kind: 'error', message: `已保存到本地，但推送到 Overleaf 失败：${status.pushError}` };
      }
      if (status?.lastPushPath === path && pushedAt >= savedAt) {
        return { kind: 'pushed', message: '已保存并推送到 Overleaf。' };
      }
      if (status?.phase !== 'connected' || status?.paused) {
        return { kind: 'local', message: '已保存到本地；实时同步未连接。' };
      }
      if ((status?.pending ?? 0) === 0 && (status?.inFlight ?? 0) === 0 && status?.flushing !== true) {
        return { kind: 'settled', message: '已保存到本地（内容与 Overleaf 一致）。' };
      }
      return { kind: 'pending', message: '已保存到本地，推送仍在进行…' };
    }

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

    /* ------------------------------- Code editor ------------------------------- */

    let editorPromise;
    /** Load the vendored CodeMirror chunk once per page. */
    function loadEditor() {
      if (editorPromise !== undefined) return editorPromise;
      if (typeof require?.async !== 'function') {
        return Promise.reject(new Error('module loader has no require.async'));
      }
      editorPromise = Promise.resolve()
        .then(() => require.async('./client.editor.js'))
        .catch((error) => { editorPromise = undefined; throw error; });
      return editorPromise;
    }

    /**
     * CodeMirror-backed source editor. The chunk is lazy so a Session that never
     * opens a source file does not pay for it. If the chunk cannot load, a
     * textarea with the same DSH code-font rules keeps editing usable.
     */
    const CodeEditor = forwardRef(function CodeEditor({ value, readOnly, onChange, onSave, getCompletions, className }, ref) {
      const hostRef = useRef(undefined);
      const fallbackRef = useRef(undefined);
      const handleRef = useRef(undefined);
      const pendingLine = useRef(undefined);
      const callbacksRef = useRef({ onChange, onSave, getCompletions });
      const valueRef = useRef(value ?? '');
      callbacksRef.current = { onChange, onSave, getCompletions };
      valueRef.current = value ?? '';
      const [phase, setPhase] = useState('loading');

      useLayoutEffect(() => {
        let cancelled = false;
        let local;
        loadEditor().then((module) => {
          if (cancelled || hostRef.current === null || hostRef.current === undefined) return;
          local = module.create(hostRef.current, {
            value: valueRef.current,
            readOnly: readOnly === true,
            onChange: (text) => callbacksRef.current.onChange?.(text),
            onSave: () => callbacksRef.current.onSave?.(),
            getCompletions: (cm) => callbacksRef.current.getCompletions?.(cm),
          });
          handleRef.current = local;
          setPhase('ready');
        }).catch((error) => {
          if (!cancelled) {
            console.warn('[dsh-overleaf-workshop] CodeMirror failed to load; using textarea', error);
            setPhase('fallback');
          }
        });
        return () => {
          cancelled = true;
          local?.destroy();
          if (handleRef.current === local) handleRef.current = undefined;
        };
        // The editor is created once for the lifetime of this tab body.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      useLayoutEffect(() => {
        if (phase !== 'ready') return;
        handleRef.current?.setValue(value ?? '');
      }, [phase, value]);

      useLayoutEffect(() => {
        if (phase !== 'ready') return;
        handleRef.current?.setReadOnly(readOnly === true);
      }, [phase, readOnly]);

      useLayoutEffect(() => {
        if (phase !== 'ready') return;
        handleRef.current?.setCompletions(getCompletions);
      }, [phase, getCompletions]);

      useLayoutEffect(() => {
        if (phase !== 'ready' || pendingLine.current === undefined) return;
        const line = pendingLine.current;
        pendingLine.current = undefined;
        handleRef.current?.revealLine(line);
      }, [phase]);

      useEffect(() => {
        if (phase !== 'ready') return undefined;
        let frame;
        const refresh = () => {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => handleRef.current?.refresh());
        };
        const observer = new MutationObserver(refresh);
        observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style', 'data-ds-dark-theme'] });
        const resize = typeof ResizeObserver === 'function' && hostRef.current !== undefined
          ? new ResizeObserver(refresh) : undefined;
        resize?.observe(hostRef.current);
        window.addEventListener('resize', refresh);
        if (document.fonts?.ready !== undefined) document.fonts.ready.then(refresh).catch(() => {});
        document.fonts?.addEventListener?.('loadingdone', refresh);
        return () => {
          cancelAnimationFrame(frame);
          observer.disconnect();
          resize?.disconnect();
          window.removeEventListener('resize', refresh);
          document.fonts?.removeEventListener?.('loadingdone', refresh);
        };
      }, [phase]);

      const revealFallback = (line) => {
        const node = fallbackRef.current;
        if (node === null || node === undefined) return;
        const height = parseFloat(getComputedStyle(node).lineHeight) || 19;
        const lines = node.value.split('\n');
        const offset = lines.slice(0, Math.max(0, line - 1)).join('\n').length;
        node.focus();
        node.setSelectionRange(offset, offset + (lines[line - 1]?.length ?? 0));
        node.scrollTop = Math.max(0, (line - 3) * height);
      };

      useImperativeHandle(ref, () => ({
        revealLine(line) {
          if (handleRef.current !== undefined) handleRef.current.revealLine(line);
          else if (phase === 'fallback') revealFallback(line);
          else pendingLine.current = line;
        },
        focus() {
          if (handleRef.current !== undefined) handleRef.current.focus();
          else fallbackRef.current?.focus();
        },
        hasFocus() {
          if (handleRef.current !== undefined) return handleRef.current.hasFocus();
          return document.activeElement === fallbackRef.current;
        },
        refresh() { handleRef.current?.refresh(); },
      }), [phase]);

      useLayoutEffect(() => {
        if (phase !== 'fallback' || pendingLine.current === undefined) return;
        const line = pendingLine.current;
        pendingLine.current = undefined;
        revealFallback(line);
      }, [phase]);

      const fallback = phase === 'fallback';
      const onFallbackKeyDown = (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
          event.preventDefault();
          callbacksRef.current.onSave?.();
        }
      };

      return h('div', {
        className: `dsh-ol-cm-wrap${className === undefined ? '' : ` ${className}`}`,
        // DSH's GenUI plugin sweeps every <pre>/<span> in the document. A
        // CodeMirror buffer has hundreds of them, and that O(n²) sweep pegs a
        // renderer core. The fence marker is GenUI's own "do not scan this
        // subtree" signal, so the editor no longer participates in its sweeps.
        'data-genui-svg-fence': '',
      },
        fallback
          ? h('textarea', {
            ref: fallbackRef,
            className: 'dsh-ol-cm-fallback',
            value: value ?? '',
            readOnly: readOnly === true,
            spellCheck: false,
            onKeyDown: onFallbackKeyDown,
            onChange: (event) => callbacksRef.current.onChange?.(event.target.value),
          })
          : h('div', { ref: hostRef, className: 'dsh-ol-cm' }),
        phase === 'loading' ? h('div', { className: 'dsh-ol-cm-loading' }, '正在加载编辑器…') : null);
    });

    function CreateIcon({ folder }) {
      return h('svg', { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
      folder
        ? h('path', { d: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' })
        : h('path', { d: 'M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7zM14 2v5h5' }),
      h('path', { d: 'M12 11v6M9 14h6' }));
    }

    /**
     * New file / new folder controls in the built-in Files tab header.
     *
     * The header slot is the supported extension point; it receives the tree
     * root. The controls stay hidden outside Overleaf workspaces and on hosts
     * that do not expose the creation RPCs.
     */
    function FilesActions({ absolutePath, api, openInEditor }) {
      const [bound, setBound] = useState(undefined);
      const [kind, setKind] = useState(undefined);
      const [targetDirectory, setTargetDirectory] = useState('');
      const [error, setError] = useState('');
      const [busy, setBusy] = useState(false);
      const wrapperRef = useRef(undefined);
      const dialogRef = useRef(undefined);
      const inputRef = useRef(undefined);
      const formRef = useRef(undefined);
      const busyRef = useRef(false);

      useEffect(() => {
        let cancelled = false;
        setBound(undefined);
        if (typeof absolutePath !== 'string' || absolutePath.length === 0) { setBound(false); return undefined; }
        if (Object.values(sessionDirs()).includes(absolutePath)) setBound(true);
        api('bound', { local_path: absolutePath })
          .then((result) => { if (!cancelled) setBound(result?.bound === true); })
          .catch(() => { if (!cancelled) setBound(false); });
        return () => { cancelled = true; };
      }, [api, absolutePath]);

      const close = () => {
        busyRef.current = false;
        setKind(undefined);
        setError('');
        setBusy(false);
        if (dialogRef.current?.open === true) dialogRef.current.close();
      };

      const open = (nextKind, directoryRel = '') => {
        setKind(nextKind);
        setTargetDirectory(normalizeTreePath(directoryRel));
        setError('');
        if (inputRef.current !== undefined) inputRef.current.value = '';
        requestAnimationFrame(() => {
          if (dialogRef.current?.open !== true) dialogRef.current?.showModal();
          inputRef.current?.focus();
        });
      };

      const reloadTree = () => {
        setTimeout(() => {
          const pane = wrapperRef.current?.closest('[data-dockkit-pane]');
          pane?.querySelector('button[data-files-reload]')?.click();
        }, 80);
      };

      const submit = async () => {
        if (busyRef.current || kind === undefined) return;
        let name = String(inputRef.current?.value ?? '').trim().replace(/\\/g, '/').replace(/^(?:\.\/)+/u, '');
        if (kind === 'folder') name = name.replace(/\/+$/u, '');
        if (name.length === 0 || name.startsWith('/') || /^[A-Za-z]:\//u.test(name)
          || name.includes('\0') || name.split('/').some((part) => part === '' || part === '.' || part === '..')
          || name === '.overleaf' || name.startsWith('.overleaf/')) {
          setError('请输入文件名或目录名，例如 intro.tex。');
          return;
        }
        const path = targetDirectory.length === 0 ? name : `${targetDirectory}/${name}`;
        busyRef.current = true;
        setBusy(true);
        setError('');
        try {
          const result = await api(kind === 'file' ? 'createFile' : 'createFolder',
            { local_path: absolutePath, path });
          const created = result?.path ?? path;
          invalidateWorkspaceIndex(absolutePath);
          close();
          reloadTree();
          if (kind === 'file') openInEditor?.(absolutePath, created);
        } catch (e) {
          setError(errorText(e));
        } finally {
          busyRef.current = false;
          setBusy(false);
        }
      };

      // The Files-tab header stops native click propagation before React's
      // delegated root sees it, so the buttons and dialog are wired with
      // native listeners on the slot wrapper instead of React onClick.
      useEffect(() => {
        const wrapper = wrapperRef.current;
        const dialog = dialogRef.current;
        const form = formRef.current;
        if (wrapper === null || wrapper === undefined) return undefined;
        const onAction = (event) => {
          const action = event.target instanceof Element
            ? event.target.closest('[data-ol-action]')?.getAttribute('data-ol-action')
            : undefined;
          if (typeof action !== 'string') return;
          event.preventDefault();
          event.stopPropagation();
          if (action === 'file') open('file');
          else if (action === 'folder') open('folder');
          else if (action === 'cancel') close();
          else if (action === 'create') void submit();
        };
        const onSubmit = (event) => {
          event.preventDefault();
          event.stopPropagation();
          void submit();
        };
        const onCancel = (event) => { event.preventDefault(); close(); };
        const onMouseDown = (event) => { if (event.target === dialog) close(); };
        const onCreateRequest = (event) => {
          const detail = event.detail;
          if (detail?.absolutePath !== absolutePath || !['file', 'folder'].includes(detail.kind)) return;
          open(detail.kind, detail.directoryRel);
        };
        const onInput = () => setError('');
        wrapper.addEventListener('click', onAction);
        form?.addEventListener('submit', onSubmit);
        dialog?.addEventListener('cancel', onCancel);
        dialog?.addEventListener('mousedown', onMouseDown);
        wrapper.addEventListener('dsh-overleaf-create', onCreateRequest);
        inputRef.current?.addEventListener('input', onInput);
        return () => {
          wrapper.removeEventListener('click', onAction);
          form?.removeEventListener('submit', onSubmit);
          dialog?.removeEventListener('cancel', onCancel);
          dialog?.removeEventListener('mousedown', onMouseDown);
          wrapper.removeEventListener('dsh-overleaf-create', onCreateRequest);
          inputRef.current?.removeEventListener('input', onInput);
        };
      }, [api, absolutePath, bound, kind, openInEditor, targetDirectory]);

      if (bound !== true) return null;

      return h('div', {
        ref: wrapperRef,
        className: 'dsh-ol-fa',
      },
      h('button', { type: 'button', 'data-ol-action': 'file', title: '新建文件', 'aria-label': '新建文件' }, h(CreateIcon, { folder: false })),
      h('button', { type: 'button', 'data-ol-action': 'folder', title: '新建文件夹', 'aria-label': '新建文件夹' }, h(CreateIcon, { folder: true })),
      h('dialog', {
        ref: dialogRef,
        className: 'dsh-ol-fa-dialog',
      },
      h('form', { ref: formRef, method: 'dialog' },
        h('div', { className: 'dsh-ol-fa-title' }, kind === 'folder' ? '新建文件夹' : '新建文件'),
        h('div', { className: 'dsh-ol-fa-sub' }, targetDirectory === '' ? absolutePath : `${absolutePath}/${targetDirectory}`),
        h('input', {
          ref: inputRef,
          spellCheck: false,
          placeholder: kind === 'folder' ? '例如 figures' : '例如 intro.tex',
        }),
        error !== '' ? h('div', { className: 'dsh-ol-fa-error' }, error) : null,
        h('div', { className: 'dsh-ol-fa-actions' },
          h('button', { type: 'button', 'data-ol-action': 'cancel' }, '取消'),
          h('button', { type: 'button', 'data-ol-action': 'create', className: 'primary', disabled: busy },
            busy ? '创建中…' : '创建')))));
    }

    /** Read only changed PDF bytes through the host's authorized file service. */
    function pdfReader(ctx) {
      return async (sessionId, signal, version) => {
        const files = ctx.get?.('remote.workspaceFiles') ?? ctx.get?.('remote')?.workspaceFiles;
        if (files === undefined) throw new Error('DSH 文件读取服务尚未就绪。');
        const metadata = await files.stat(sessionId, 'output.pdf', signal);
        if (!metadata.ok) throw new Error(metadata.error.message);
        if (version !== undefined && metadata.value.version === version) return undefined;
        const result = await files.readBytes(sessionId, 'output.pdf', {}, signal);
        if (!result.ok) throw new Error(result.error.message);
        return result.value;
      };
    }

    /** Render the host's PDF body inside our tab, without creating another dock pane. */
    function InlinePdf({ useTabInfo, renderSlot, readPdf, sessionId, revision, visible, onClose }) {
      const [content, setContent] = useState(undefined);
      const [error, setError] = useState('');
      const [attempt, setAttempt] = useState(0);
      const version = useRef(undefined);
      const scrollport = useRef(null);
      useEffect(() => {
        if (!visible) return undefined;
        const controller = new AbortController();
        let running = false;
        const refresh = async () => {
          if (running || controller.signal.aborted) return;
          running = true;
          try {
            const result = await readPdf(sessionId, controller.signal, version.current);
            if (controller.signal.aborted) return;
            if (result !== undefined) {
              version.current = result.version;
              setContent({ kind: 'bytes', data: result.data });
            }
            setError('');
          } catch (e) { if (!controller.signal.aborted) setError(errorText(e)); }
          finally { running = false; }
        };
        void refresh();
        const timer = setInterval(() => { void refresh(); }, 2500);
        return () => { controller.abort(); clearInterval(timer); };
      }, [readPdf, sessionId, revision, visible, attempt]);
      const bindScrollport = useCallback((node) => { scrollport.current = node; }, []);
      return h('section', { className: 'dsh-ol-inline-pdf', 'aria-label': 'PDF 预览' },
        h('div', { className: 'dsh-ol-src-bar' }, h('span', null, 'output.pdf'),
          h('span', { className: 'dsh-ol-src-spacer' }),
          h('button', { onClick: () => { version.current = undefined; setAttempt((value) => value + 1); } }, '刷新'),
          h('button', { onClick: onClose, title: '收起 PDF，保留源码编辑器' }, '收起')),
        error ? h('div', { className: 'dsh-ol-src-note error', role: 'alert' }, error) : null,
        h('div', { className: 'dsh-ol-inline-pdf-body' }, content === undefined
          ? h('div', { className: 'dsh-ol-src-empty' }, error ? 'PDF 加载失败，请重试。' : '正在加载 PDF…')
          : renderSlot('overleaf.source.pdf', {
            resourceAddress: fileAddress(sessionId, 'output.pdf'), content, wrap: false,
            scrollportRef: bindScrollport,
          }, { entryKey: '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/pdf',
            hookContext: useTabInfo,
            fallback: h('div', { className: 'dsh-ol-src-empty' }, 'DSH PDF 预览组件尚未就绪。'),
          })));
    }

    /** Editable source and optional PDF share one DSH tab and its lifetime. */
    function SourceTab({ useTabInfo, api, renderSlot, readPdf }) {
      const { tab } = useTabInfo();
      const target = parseFileAddress(tab.contentId);
      const sessionId = target?.sessionId;
      const path = target?.path;
      // The directory this plugin opened for the Session, when still remembered;
      // the host can otherwise derive it from the Session header.
      const [localPath] = useState(() => (sessionId === undefined ? undefined : sessionDirs()[sessionId]));
      const where = () => (typeof localPath === 'string' ? { local_path: localPath } : { session_id: sessionId });
      const workspaceKey = localPath ?? sessionId;
      const [file, setFile] = useState(undefined);
      const [dirty, setDirty] = useState(false);
      const [busy, setBusy] = useState('');
      const [error, setError] = useState('');
      const [notice, setNotice] = useState('');
      const [compile, setCompile] = useState(undefined);
      const [hasPdf, setHasPdf] = useState(false);
      const pdfVisibility = pdfVisibilityStore(workspaceKey);
      const pdfOpen = useSyncExternalStore(pdfVisibility.subscribe, pdfVisibility.getSnapshot);
      const setPdfOpen = pdfVisibility.set;
      const workspaceRef = useRef(null);
      const [narrow, setNarrow] = useState(false);
      useEffect(() => {
        const node = workspaceRef.current;
        if (node === null) return undefined;
        const observer = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < 650));
        observer.observe(node);
        return () => observer.disconnect();
      }, []);
      const [syncEnded, setSyncEnded] = useState(false);
      /** {path, startedAt}: a save whose push is still settling, polled below. */
      const [pushWatch, setPushWatch] = useState(undefined);
      /** Bumped on every buffer change, so the autosave timer restarts. */
      const [editRevision, setEditRevision] = useState(0);
      const [saving, setSaving] = useState(false);
      const [workspaceIndex, setWorkspaceIndex] = useState(undefined);
      const [outlineOpen, setOutlineOpen] = useState(false);
      const [recovery, setRecovery] = useState(undefined);
      const savingRef = useRef(false);
      const editorRef = useRef(undefined);
      // Where the last navigation asked to land; read when the initial load
      // resolves, so re-clicking an open tab never re-reads (and never drops an
      // unsaved buffer) just to jump to a line.
      const lineRef = useRef(undefined);
      // The latest buffer as the polling timer and the save path see it, without
      // recreating either on every keystroke.
      const live = useRef({ text: '', baseText: '', mtimeMs: 0, dirty: false });
      /** Defer remote merges for a moment after a keystroke, so typing is not disturbed. */
      const lastEditAt = useRef(0);

      const adopt = useCallback((result) => {
        live.current = { text: result.text, baseText: result.text, mtimeMs: result.mtimeMs, dirty: false };
        setFile({ path, text: result.text, mtimeMs: result.mtimeMs });
        setDirty(false);
        setPushWatch(undefined);
        if (workspaceKey !== undefined && path !== undefined) {
          const draft = readDraft(workspaceKey, path);
          if (draft !== undefined && draft.text !== result.text && Date.now() - draft.savedAt < 7 * 24 * 60 * 60 * 1000) {
            setRecovery(draft);
          } else if (draft?.text === result.text) clearDraft(workspaceKey, path);
        }
        const line = lineRef.current;
        if (typeof line === 'number') requestAnimationFrame(() => editorRef.current?.revealLine(line));
      }, [path, workspaceKey]);

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

      useEffect(() => {
        if (typeof workspaceKey !== 'string') return undefined;
        let cancelled = false;
        void loadWorkspaceIndex(api, where())
          .then((index) => { if (!cancelled) setWorkspaceIndex(index); })
          .catch(() => {});
        return () => { cancelled = true; };
      }, [api, workspaceKey, localPath]);

      // A later navigation (an error row, the file tree) only moves the caret.
      useEffect(() => {
        const line = tab.navigation?.params?.line;
        if (typeof line === 'number' && live.current.text !== '') {
          editorRef.current?.revealLine(line);
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
        const update = (status) => {
          if (!cancelled) setSyncEnded(!['connected', 'connecting', 'reconnecting'].includes(status.phase));
        };
        const changed = (event) => {
          const dir = localPath ?? sessionDirs()[sessionId];
          if (dir !== undefined && sameDir(dir, event.detail?.localDir)) update(event.detail);
        };
        window.addEventListener('dsh-overleaf:live', changed);
        void api('live', { ...where(), action: 'status' }).then(update).catch(() => {});
        return () => { cancelled = true; window.removeEventListener('dsh-overleaf:live', changed); };
      }, [api, sessionId, path, tab.visible, localPath]);

      // One workspace-level poller batches all open source tabs into a single
      // readFiles RPC. It preserves the old three-way merge behaviour while
      // avoiding one timer and one request per editor tab.
      useEffect(() => {
        if (sessionId === undefined || path === undefined || tab.visible === false) return undefined;
        return subscribeWorkspaceFiles(api, where(), path, async (result) => {
          try {
            const current = live.current;
            if (result.text === current.text) {
              live.current = { ...current, baseText: result.text, mtimeMs: result.mtimeMs };
              return;
            }
            if (!current.dirty) {
              live.current = { text: result.text, baseText: result.text, mtimeMs: result.mtimeMs, dirty: false };
              setFile({ path, text: result.text, mtimeMs: result.mtimeMs });
              setDirty(false);
              setNotice('');
              return;
            }
            if (result.text === current.baseText) {
              live.current = { ...current, mtimeMs: result.mtimeMs };
              return;
            }
            if (Date.now() - lastEditAt.current < 1200) return;
            const merged = await api('merge', { base_text: current.baseText,
              ours: current.text, theirs: result.text });
            const latest = live.current;
            if (latest.text !== current.text) return;
            const nextText = merged.text;
            live.current = { ...latest, text: nextText, baseText: result.text,
              mtimeMs: result.mtimeMs, dirty: nextText !== result.text };
            if (nextText !== latest.text) {
              setFile((previous) => (previous === undefined ? previous
                : { ...previous, text: nextText, mtimeMs: result.mtimeMs }));
            }
            setDirty(nextText !== result.text);
            if (nextText !== result.text) setEditRevision((value) => value + 1);
            setNotice(merged.conflict ? '远端改动有冲突，已保留本地文本。' : '');
          } catch { /* the file may be mid-write; retry on the next batch */ }
        });
      }, [api, sessionId, path, tab.visible, localPath]);

      const save = useCallback(async ({ auto = false } = {}) => {
        // Starting or stopping live sync must not lock the local buffer: during
        // a network outage that RPC can take a long time, and the user still
        // needs to save work.
        if (sessionId === undefined || path === undefined || busy === 'save' || busy === 'load'
          || !live.current.dirty) return false;
        // A manual save or compile during an autosave waits for it, then saves
        // whatever was typed meanwhile.
        while (savingRef.current) await new Promise((resolveWait) => setTimeout(resolveWait, 50));
        if (!live.current.dirty) return true;
        savingRef.current = true;
        setSaving(true);
        if (!auto) setBusy('save');
        const startedAt = Date.now();
        const savedText = live.current.text;
        const savedBase = live.current.baseText;
        try {
          const result = await api('writeFile', { ...where(), path,
            text: savedText, base_text: savedBase, mtime_ms: live.current.mtimeMs });
          const latest = live.current;
          if (latest.text === savedText) {
            live.current = { text: result.text, baseText: result.text,
              mtimeMs: result.mtimeMs, dirty: false };
            setFile((previous) => (previous === undefined ? previous
              : { ...previous, text: result.text, mtimeMs: result.mtimeMs }));
            setDirty(false);
            if (workspaceKey !== undefined) clearDraft(workspaceKey, path);
          } else {
            // Keystrokes arrived while the save was on the wire. Keep them and
            // let the merge poll apply base(savedText) -> disk(result.text).
            live.current = { ...latest, baseText: savedText,
              mtimeMs: result.mtimeMs, dirty: true };
            setDirty(true);
          }
          setNotice(result.conflict ? '远端改动有冲突，已保留本地文本。' : '');
          setError('');
          setPushWatch(undefined);
          // Push now instead of waiting for fs.watch's debounce, then report
          // what actually happened. The old fixed notice stayed on screen even
          // after the host had crashed, so it read as a permanent "pushing".
          try {
            const status = await api('live', { ...where(), action: 'flush' });
            const outcome = pushOutcome(status, path, startedAt);
            if (outcome.kind === 'error') { setNotice(''); setError(outcome.message); }
            if (outcome.kind === 'pending') setPushWatch({ path, startedAt });
          } catch (e) {
            setError(`已保存到本地；推送不可用：${errorText(e)}`);
          }
          return true;
        } catch (e) { setError(errorText(e)); return false; }
        finally {
          savingRef.current = false;
          setSaving(false);
          if (!auto) setBusy('');
        }
      }, [api, sessionId, path, busy]);

      // A flush can return while the echo or a reconnect is still in flight.
      // Keep asking until the save has a final answer, so "推送仍在进行…" is
      // never the last thing the user sees.
      useEffect(() => {
        if (pushWatch === undefined || sessionId === undefined) return undefined;
        let cancelled = false;
        let timer;
        const deadline = pushWatch.startedAt + 30000;
        const poll = async () => {
          let status;
          try {
            status = await api('live', { ...where(), action: 'status' });
          } catch { /* keep the last message and try again */ }
          if (cancelled) return;
          if (status !== undefined) {
            const outcome = pushOutcome(status, pushWatch.path, pushWatch.startedAt);
            if (outcome.kind !== 'pending') {
              if (outcome.kind === 'error') { setNotice(''); setError(outcome.message); }
              setPushWatch(undefined);
              return;
            }
          }
          if (Date.now() >= deadline) {
            // The local save is safe; a slow push should not keep a banner on
            // screen. A concrete rejection above still reports.
            setPushWatch(undefined);
            return;
          }
          timer = setTimeout(poll, 500);
        };
        timer = setTimeout(poll, 400);
        return () => { cancelled = true; clearTimeout(timer); };
      }, [pushWatch, api, sessionId, path, localPath]);

      // Autosave: after a short pause, write the buffer and push it. Ctrl+S
      // still works, but is no longer required.
      useEffect(() => {
        if (!dirty || sessionId === undefined || path === undefined) return undefined;
        if (saving || busy === 'save' || busy === 'load') return undefined;
        const timer = setTimeout(() => { void save({ auto: true }); }, 900);
        return () => clearTimeout(timer);
      }, [editRevision, dirty, saving, busy, save, sessionId, path]);

      // Keep a small browser-local recovery copy while the buffer is dirty.
      // This survives a renderer crash or an interrupted Harness restart; a
      // matching save removes it automatically.
      useEffect(() => {
        if (!dirty || workspaceKey === undefined || path === undefined) return undefined;
        const timer = setTimeout(() => writeDraft(workspaceKey, path, {
          text: live.current.text, baseText: live.current.baseText, mtimeMs: live.current.mtimeMs,
        }), 500);
        return () => clearTimeout(timer);
      }, [dirty, editRevision, workspaceKey, path]);

      const recoverDraft = () => {
        if (recovery === undefined) return;
        live.current = { text: recovery.text, baseText: recovery.baseText ?? live.current.baseText,
          mtimeMs: recovery.mtimeMs ?? live.current.mtimeMs, dirty: true };
        setFile((previous) => (previous === undefined ? previous : { ...previous, text: recovery.text }));
        setDirty(true);
        setEditRevision((value) => value + 1);
        setRecovery(undefined);
        setNotice('已恢复本地草稿，保存后会重新推送到 Overleaf。');
      };
      const discardDraft = () => {
        if (workspaceKey !== undefined && path !== undefined) clearDraft(workspaceKey, path);
        setRecovery(undefined);
      };

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

      const openPdf = () => { setPdfOpen((value) => !value); };

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

      if (target === undefined) {
        return h('div', { className: 'dsh-ol-src' }, h('style', null, SOURCE_CSS + EDITOR_CSS),
          h('div', { className: 'dsh-ol-src-empty' }, '无法解析这个文件地址。请从工作区的文件树重新打开。'));
      }

      const jump = (item) => {
        if (typeof item.line === 'number' && (item.file === null || item.file === undefined || item.file === path)) {
          editorRef.current?.revealLine(item.line);
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
      const outline = sourceOutline(file?.text ?? '');

      return h('div', { className: 'dsh-ol-src' }, h('style', null, SOURCE_CSS + EDITOR_CSS),
        h('div', { className: 'dsh-ol-src-bar' },
          h('span', { className: 'dsh-ol-src-name' }, basenameOf(path)),
          h('span', { className: 'dsh-ol-src-spacer' }),
          h('button', { disabled: file === undefined, onClick: () => setOutlineOpen((value) => !value) }, outlineOpen ? '隐藏大纲' : '大纲'),
          h('button', { disabled: busy === 'save' || busy === 'load' || saving || !dirty,
            onClick: () => { void save(); } },
            busy === 'save' ? '保存中…' : '保存'),
          h('button', { className: 'primary', disabled: busy !== '', onClick: () => { void compileNow(); } },
            busy === 'compile' ? '编译中…' : '编译'),
          hasPdf ? h('button', { 'aria-pressed': pdfOpen, onClick: openPdf }, pdfOpen ? '收起 PDF' : '分屏 PDF') : null,
          h('button', { disabled: busy !== '', title: syncEnded
            ? '重新建立与 Overleaf 的实时连接'
            : '推送当前改动后关闭实时连接，停止监听文件；文件保留在本机',
          onClick: () => { void toggleSync(); } },
          busy === 'live' ? '处理中…' : syncEnded ? '恢复同步' : '结束')),
        h('div', { className: 'dsh-ol-src-path' }, `${path} · ${statusLine}`),
        error !== '' ? h('div', { className: 'dsh-ol-src-note error' }, error) : null,
        notice !== '' && error === '' ? h('div', { className: 'dsh-ol-src-note ok' }, notice) : null,
        recovery !== undefined ? h('div', { className: 'dsh-ol-src-recovery' },
          h('span', null, '发现未恢复的本地草稿（可能来自上次异常退出）。'),
          h('button', { onClick: recoverDraft }, '恢复草稿'),
          h('button', { onClick: discardDraft }, '丢弃')) : null,
        outlineOpen ? h('div', { className: 'dsh-ol-src-outline' },
          h('div', { className: 'dsh-ol-src-outline-head' }, h('span', null, '章节大纲'),
            h('span', null, `${outline.length} 项`)),
          outline.length === 0 ? h('div', { className: 'dsh-ol-src-empty' }, '当前文件还没有章节命令。')
            : outline.map((item) => h('button', { key: `${item.line}:${item.title}`, style: { paddingLeft: `${6 + item.level * 12}px` },
              title: `${item.kind} · 第 ${item.line} 行`, onClick: () => editorRef.current?.revealLine(item.line) }, item.title || '(未命名章节)'))) : null,
        h('div', { className: `dsh-ol-source-workspace${narrow ? ' narrow' : ''}`, ref: workspaceRef,
          'data-pdf-open': hasPdf && pdfOpen },
        h('div', { className: 'dsh-ol-source-editor' }, h(CodeEditor, {
          ref: editorRef,
          value: file?.text ?? '',
          readOnly: file === undefined,
          getCompletions: (cm) => completionResult(workspaceIndex, cm),
          onSave: () => { void save(); },
          onChange: (text) => {
            live.current = { ...live.current, text, dirty: true };
            lastEditAt.current = Date.now();
            setEditRevision((value) => value + 1);
            setFile((previous) => (previous === undefined ? previous : { ...previous, text }));
            setDirty(true);
            setNotice('');
            setPushWatch(undefined);
          },
        })),
        hasPdf && pdfOpen ? h(InlinePdf, { useTabInfo, renderSlot, readPdf, sessionId,
          revision: compile, visible: tab.visible !== false, onClose: () => setPdfOpen(false) }) : null),
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
        if (method === 'list' || method === 'overview') {
          for (const workspace of result.value.workspaces) {
            removedWorkspaceSessions.set(workspace.localDir, new Set(workspace.removedSessionIds ?? []));
          }
        }
        if (method === 'forgetSession') {
          removedWorkspaceSessions.set(result.value.localDir, new Set(result.value.removedSessionIds));
        }
        if (method === 'live' && ['start', 'stop', 'pause', 'resume'].includes(request?.action)) {
          window.dispatchEvent(new CustomEvent('dsh-overleaf:live', { detail: result.value }));
        }
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

    /** Render only the visible rows of a potentially very large project tree. */
    function VirtualFileList({ entries, file, busy, onOpen }) {
      const [scrollTop, setScrollTop] = useState(0);
      const viewportRef = useRef(undefined);
      const rowHeight = 30;
      const viewportHeight = viewportRef.current?.clientHeight ?? 560;
      const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 8);
      const visibleCount = Math.ceil(viewportHeight / rowHeight) + 16;
      const visible = entries.slice(start, Math.min(entries.length, start + visibleCount));
      return h('div', { className: 'dsh-ol-files', ref: viewportRef,
        onScroll: (event) => setScrollTop(event.currentTarget.scrollTop) },
      h('div', { className: 'dsh-ol-files-inner', style: { height: `${entries.length * rowHeight}px` } },
        visible.map((entry, index) => h('button', {
          key: entry.path,
          className: `dsh-ol-file${entry.type === 'folder' ? ' folder' : ''}${file?.path === entry.path ? ' active' : ''}`,
          disabled: entry.type === 'folder' || busy !== '',
          style: { position: 'absolute', top: `${(start + index) * rowHeight}px`, left: 0, right: 0,
            paddingLeft: 8 + (entry.path.split('/').length - 1) * 12 },
          onClick: () => { void onOpen(entry.path); },
        }, entry.type === 'folder' ? '▸ ' : '  ', entry.path.split('/').pop()))));
    }

    /** File tree + source editor + compile results for one workspace. */
    function WorkspaceEditor({ workspace, api, openPdf, onClose }) {
      const [entries, setEntries] = useState([]);
      const [file, setFile] = useState(undefined);
      const [dirty, setDirty] = useState(false);
      const [status, setStatus] = useState(undefined);
      const [busy, setBusy] = useState('');
      const [error, setError] = useState('');
      const [notice, setNotice] = useState('');
      const [compile, setCompile] = useState(undefined);
      const [pushWatch, setPushWatch] = useState(undefined);
      const [workspaceIndex, setWorkspaceIndex] = useState(undefined);
      const [outlineOpen, setOutlineOpen] = useState(false);
      const [recovery, setRecovery] = useState(undefined);
      const [editRevision, setEditRevision] = useState(0);
      const editorRef = useRef(undefined);
      const bufferRef = useRef({ text: '', baseText: '', mtimeMs: 0 });

      const loadFiles = useCallback(async () => {
        const result = await loadWorkspaceIndex(api, workspace.localDir);
        setWorkspaceIndex(result);
        setEntries(result.entries);
      }, [api, workspace.localDir]);

      const openFile = useCallback(async (path, line) => {
        setBusy(`open:${path}`);
        try {
          const result = await api('readFile', { local_path: workspace.localDir, path });
          bufferRef.current = { text: result.text, baseText: result.text, mtimeMs: result.mtimeMs };
          setFile({ path, text: result.text, mtimeMs: result.mtimeMs });
          setDirty(false);
          const draft = readDraft(workspace.localDir, path);
          if (draft !== undefined && draft.text !== result.text && Date.now() - draft.savedAt < 7 * 24 * 60 * 60 * 1000) {
            setRecovery(draft);
          } else if (draft?.text === result.text) clearDraft(workspace.localDir, path);
          setError('');
          setPushWatch(undefined);
          if (line !== undefined && line !== null) {
            requestAnimationFrame(() => editorRef.current?.revealLine(line));
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
        const startedAt = Date.now();
        try {
          const result = await api('writeFile', { local_path: workspace.localDir, path: file.path,
            text: bufferRef.current.text, base_text: bufferRef.current.baseText,
            mtime_ms: bufferRef.current.mtimeMs });
          bufferRef.current = { text: result.text, baseText: result.text, mtimeMs: result.mtimeMs };
          setFile({ ...file, text: result.text, mtimeMs: result.mtimeMs });
          setDirty(false);
          clearDraft(workspace.localDir, file.path);
          setNotice(result.conflict ? '远端改动有冲突，已保留本地文本。' : '');
          setError('');
          setPushWatch(undefined);
          try {
            const status = await api('live', { local_path: workspace.localDir, action: 'flush' });
            const outcome = pushOutcome(status, file.path, startedAt);
            if (outcome.kind === 'error') { setNotice(''); setError(outcome.message); }
            if (outcome.kind === 'pending') setPushWatch({ path: file.path, startedAt });
          } catch (e) {
            setError(`已保存到本地；推送不可用：${errorText(e)}`);
          }
          return true;
        } catch (e) { setError(errorText(e)); return false; } finally { setBusy(''); }
      }, [api, workspace.localDir, file, dirty]);

      // A flush can return while the echo is still in flight; keep asking until
      // the push has a final answer. Routine success stays silent.
      useEffect(() => {
        if (pushWatch === undefined) return undefined;
        let cancelled = false;
        let timer;
        const deadline = pushWatch.startedAt + 30000;
        const poll = async () => {
          let current;
          try {
            current = await api('live', { local_path: workspace.localDir, action: 'status' });
          } catch { /* try again */ }
          if (cancelled) return;
          if (current !== undefined) {
            const outcome = pushOutcome(current, pushWatch.path, pushWatch.startedAt);
            if (outcome.kind !== 'pending') {
              if (outcome.kind === 'error') { setNotice(''); setError(outcome.message); }
              setPushWatch(undefined);
              return;
            }
          }
          if (Date.now() >= deadline) { setPushWatch(undefined); return; }
          timer = setTimeout(poll, 500);
        };
        timer = setTimeout(poll, 400);
        return () => { cancelled = true; clearTimeout(timer); };
      }, [pushWatch, api, workspace.localDir]);

      useEffect(() => {
        if (!dirty || file === undefined) return undefined;
        const timer = setTimeout(() => writeDraft(workspace.localDir, file.path, {
          text: bufferRef.current.text, baseText: bufferRef.current.baseText, mtimeMs: bufferRef.current.mtimeMs,
        }), 500);
        return () => clearTimeout(timer);
      }, [dirty, editRevision, workspace.localDir, file?.path]);

      const recoverDraft = () => {
        if (recovery === undefined || file === undefined) return;
        bufferRef.current = { text: recovery.text, baseText: recovery.baseText ?? bufferRef.current.baseText,
          mtimeMs: recovery.mtimeMs ?? bufferRef.current.mtimeMs };
        setFile((previous) => (previous === undefined ? previous : { ...previous, text: recovery.text }));
        setDirty(true);
        setEditRevision((value) => value + 1);
        setRecovery(undefined);
        setNotice('已恢复本地草稿，保存后会重新推送到 Overleaf。');
      };
      const discardDraft = () => {
        if (file !== undefined) clearDraft(workspace.localDir, file.path);
        setRecovery(undefined);
      };

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

      const header = h('div', { className: 'dsh-ol-row-head', style: { marginBottom: 12 } },
        h('div', null,
          h('div', { className: 'dsh-ol-title' }, workspace.projectName),
          h('div', { className: 'dsh-ol-sub' }, workspace.localDir)),
        h('div', { className: 'dsh-ol-actions' },
          h('button', { disabled: busy !== '', onClick: openPdf }, '打开 PDF'),
          h('button', { disabled: busy !== '', onClick: onClose }, '收起编辑器')));

      const fileList = h(VirtualFileList, { entries, file, busy, onOpen: openFile });

      const codeBar = h('div', { className: 'dsh-ol-codebar' },
        h('span', { className: 'dsh-ol-code-name' }, file?.path ?? '未选择文件'),
        h('span', { className: 'dsh-ol-actions' },
          dirty ? h('span', { className: 'dsh-ol-dirty' }, '未保存') : null,
          h('button', { disabled: file === undefined, onClick: () => setOutlineOpen((value) => !value) }, outlineOpen ? '隐藏大纲' : '大纲'),
          h('button', { disabled: !dirty || busy === 'save', onClick: () => { void save(); } },
            busy === 'save' ? '保存中…' : '保存 (⌘S)'),
          h('button', { className: 'dsh-ol-primary', disabled: busy !== '', onClick: () => { void compileNow(); } },
            busy === 'compile' ? '编译中…' : '编译')));

      const codeArea = h(CodeEditor, {
        ref: editorRef,
        className: 'dsh-ol-cm-panel',
        value: file?.text ?? '',
        readOnly: file === undefined,
        getCompletions: (cm) => completionResult(workspaceIndex, cm),
        onSave: () => { void save(); },
        onChange: (text) => {
          bufferRef.current = { ...bufferRef.current, text };
          setFile((previous) => (previous === undefined ? previous : { ...previous, text }));
          setDirty(true);
          setEditRevision((value) => value + 1);
          setNotice('');
          setPushWatch(undefined);
        },
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

      return h('div', { className: 'dsh-ol-card' }, h('style', null, EDITOR_CSS), header,
        h(LiveBar, { status, onLive, busy: busy !== '' }),
        error ? h('p', { className: 'dsh-ol-error' }, error) : null,
        notice ? h('p', { className: 'dsh-ol-ok' }, notice) : null,
        recovery !== undefined ? h('div', { className: 'dsh-ol-src-recovery' },
          h('span', null, '发现未恢复的本地草稿。'), h('button', { onClick: recoverDraft }, '恢复草稿'),
          h('button', { onClick: discardDraft }, '丢弃')) : null,
        outlineOpen ? h('div', { className: 'dsh-ol-src-outline' },
          h('div', { className: 'dsh-ol-src-outline-head' }, h('span', null, '章节大纲'),
            h('span', null, `${sourceOutline(file?.text ?? '').length} 项`)),
          sourceOutline(file?.text ?? '').map((item) => h('button', { key: `${item.line}:${item.title}`,
            style: { paddingLeft: `${6 + item.level * 12}px` }, onClick: () => editorRef.current?.revealLine(item.line) },
          item.title || '(未命名章节)'))) : null,
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
      const [localPaths, setLocalPaths] = useState({});
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
        const existing = data.workspaces.find((item) => item.server === primary && item.projectId === project.id);
        const localPath = existing?.localDir ?? localPaths[project.id]?.trim();
        const result = await api('open', { base_url: primary, project_id: project.id, project_name: project.name,
          ...(localPath ? { local_path: localPath } : {}) });
        setNotice(`已打开本地工作区 ${project.name}。可在侧边栏选择「连接」启动同步。`);
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
        h('h2', null, '从 Overleaf 项目创建本地工作区'),
        h('p', { className: 'dsh-ol-muted' }, '首次下载论文到本地目录；打开后按需连接同步。多个对话共用这个目录。'),
        openError ? h('p', { className: 'dsh-ol-error' }, openError) : null,
        data.projects.length === 0
          ? h('div', { className: 'dsh-ol-empty' }, '没有可用项目。先在上方登录，或确认账号下有项目。')
          : h('div', { className: 'dsh-ol-rows' }, data.projects.map((project) => h('div', {
            className: 'dsh-ol-row', key: project.id },
            h('div', { className: 'dsh-ol-row-head' },
              h('div', null,
                h('div', { className: 'dsh-ol-title' }, project.name),
                !data.workspaces.some((item) => item.server === data.primary && item.projectId === project.id)
                  ? h('input', { placeholder: '本地绝对路径（留空使用默认目录）', value: localPaths[project.id] ?? '',
                    'aria-label': `${project.name} 的本地工作区目录`, disabled: busy !== '',
                    onChange: (event) => setLocalPaths((paths) => ({ ...paths, [project.id]: event.target.value })) }) : null,
                h('div', { className: 'dsh-ol-sub' },
                  project.lastUpdated ? `最近更新 ${new Date(project.lastUpdated).toLocaleString()}` : project.id)),
              h('div', { className: 'dsh-ol-actions' },
                h('button', { className: 'dsh-ol-primary', disabled: busy !== '',
                  onClick: () => { void onOpen(project); } },
                busy === `open:${project.id}` ? '打开中…' : data.workspaces.some((item) => item.server === data.primary && item.projectId === project.id) ? '打开本地工作区' : '创建本地工作区')))))));

      const workspaceCard = h('div', { className: 'dsh-ol-card' },
        h('h2', null, '本地工作区与对话'),
        data.workspaces.length === 0
          ? h('div', { className: 'dsh-ol-empty' }, '还没有本地工作区。先在下方选择已有 Overleaf 项目创建。')
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
                  openingLast ? '打开中…' : '打开工作区'),
                  h('button', { disabled: busy !== '' || !workspace.bound,
                    onClick: () => { void newSession(workspace); } },
                  busy === `new:${workspace.localDir}` ? '创建中…' : '新建会话'),
                  running
                    ? h('button', { disabled: busy !== '', onClick: () => { void stopLive(workspace); } },
                      busy === `stop:${workspace.localDir}` ? '结束中…' : '断开连接')
                    : h('button', { disabled: busy !== '' || !workspace.bound,
                      onClick: () => { void startLive(workspace); } },
                    busy === `start:${workspace.localDir}` ? '启动中…' : '连接并同步'),
                  h('button', { disabled: busy !== '' || !workspace.bound,
                    onClick: () => setEditing(workspace.localDir) }, '编辑'))),
              h('div', { className: 'dsh-ol-sessions' },
                sessions.length === 0
                  ? h('div', { className: 'dsh-ol-session-empty' }, '还没有会话。点击「新建会话」开始。')
                  : sessions.map((session) => h('button', {
                    key: session.id,
                    className: `dsh-ol-session${session.id === current ? ' current' : ''}`,
                    title: sessionLabel(session),
                    disabled: busy !== '' || !workspace.bound,
                    onClick: () => { void openSession(workspace, session); },
                  }, h('span', { className: 'dsh-ol-session-title' }, sessionLabel(session)),
                  h('span', { className: 'dsh-ol-session-time' }, sessionTime(session.updatedAt))))));
          })));

      return h('div', { className: 'dsh-ol-page' }, h('style', null, CSS),
        h('div', { className: 'dsh-ol-inner' },
          h('div', { className: 'dsh-ol-header' },
            h('div', null, h('h1', null, 'Overleaf'), h('p', { className: 'dsh-ol-muted' },
              '选择已有论文创建本地工作区，按需连接 Overleaf；在同一个工作区中用多个独立对话持续处理同一篇论文。')))),
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
      const removed = removedWorkspaceSessions.get(workspace.path) ?? new Set();
      return workspace.sessionIds
        .filter((id) => !removed.has(id))
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
      const removed = removedWorkspaceSessions.get(localDir) ?? new Set();
      return workspace?.sessionIds?.find((id) => !archived.has(id) && !removed.has(id));
    }

    /** Human label for a Session summary. */
    function sessionLabel(session) {
      if (session.blank === true) return '新会话';
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
      style.textContent = LAYOUT_CSS + EDITOR_CSS + FILE_TREE_CSS;
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
            frameObserver.observe(frame, {
              attributes: true,
              attributeFilter: ['style', 'class', 'aria-expanded', 'aria-current', 'aria-selected'],
              childList: true,
              subtree: true,
            });
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
        decorateFileTreeRows();
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
        apply();
        // Keep the workspace and conversation list available while editing.
      };

      const onResize = () => schedule();
      window.addEventListener('resize', onResize);
      // The frame survives normal navigation, but a renderer reload can replace
      // it; re-find it when the section's DOM observer calls setActive again.
      return {
        setActive,
        refresh() {
          if (!wanted) return;
          if (frame !== undefined && !frame.isConnected) frame = undefined;
          if (scheduled !== undefined) { clearTimeout(scheduled); scheduled = undefined; }
          apply();
        },
        dispose() {
          disposed = true;
          window.removeEventListener('resize', onResize);
          frameObserver?.disconnect();
          resizeObserver?.disconnect();
          if (scheduled !== undefined) clearTimeout(scheduled);
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
      let collapsed = storedCollapse === null ? false : storedCollapse === '1';
      const FOLD_KEY = 'dsh-overleaf:collapsed-workspaces';
      const closedProjects = new Set((() => {
        try { const value = JSON.parse(localStorage.getItem(FOLD_KEY) ?? '[]'); return Array.isArray(value) ? value.filter((dir) => typeof dir === 'string') : []; }
        catch { return []; }
      })());
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

      const icon = (name, className = '') => {
        const svg = document.createElementNS(FILE_TREE_ICON_NS, 'svg');
        svg.setAttribute('width', '16'); svg.setAttribute('height', '16');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('data-icon', `dsw-icon-${name}`);
        if (className) svg.setAttribute('class', className);
        if (name === 'folder-plus') {
          svg.setAttribute('viewBox', '0 0 24 24');
          appendSvgPath(svg, 'M20 12v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h5M19 2v8M15 6h8');
        } else {
          const use = document.createElementNS(FILE_TREE_ICON_NS, 'use');
          use.setAttribute('href', `#dsw-icon-${name}`); svg.append(use);
        }
        return svg;
      };
      const iconButton = (name, label, onClick) => {
        const button = el('button', 'dsh-ol-sb-icon');
        button.type = 'button'; button.title = label; button.setAttribute('aria-label', label);
        button.append(icon(name));
        button.addEventListener('click', (event) => { event.stopPropagation(); onClick(event); });
        return button;
      };
      const compactTime = (value) => {
        const time = typeof value === 'string' ? Date.parse(value) : Number(value);
        if (!Number.isFinite(time)) return '';
        const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
        if (minutes < 1) return '刚刚';
        if (minutes < 60) return `${minutes}m`;
        if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
        return `${Math.floor(minutes / 1440)}d`;
      };
      const toggleProject = (workspace) => {
        if (closedProjects.has(workspace.localDir)) closedProjects.delete(workspace.localDir);
        else closedProjects.add(workspace.localDir);
        try { localStorage.setItem(FOLD_KEY, JSON.stringify([...closedProjects])); } catch { /* Storage is optional. */ }
        render();
      };
      function closeMenu() { (ctx.get?.('contextMenus') ?? ctx.contextMenus)?.close(); }
      function openSessionMenu(session, trigger, point) {
        const service = ctx.get?.('contextMenus') ?? ctx.contextMenus;
        if (service === undefined) { setFlash('error', 'Harness 会话菜单服务尚未就绪。'); return; }
        const active = service.active.getSnapshot();
        if (active?.kind === 'session' && active.value.sessionId === session.id) { service.close(); return; }
        trigger.focus({ preventScroll: true });
        const rect = trigger.getBoundingClientRect();
        service.open({ kind: 'session', value: { sessionId: session.id, displayTitle: sessionLabel(session) } },
          point ?? { x: rect.left, y: rect.bottom }, { button: `overleaf-session:${session.id}` });
      }
      function openMenu(workspace, trigger, point) {
        const service = ctx.get?.('contextMenus') ?? ctx.contextMenus;
        const item = workspaceItemOf(ctx, workspace.localDir);
        if (service === undefined || item === undefined) { setFlash('error', 'Harness 工作区菜单尚未就绪。'); return; }
        const active = service.active.getSnapshot();
        if (active?.kind === 'workspace' && active.value.workspaceId === item.workspaceId) { service.close(); return; }
        trigger.focus({ preventScroll: true });
        const rect = trigger.getBoundingClientRect();
        service.open({ kind: 'workspace', value: { workspaceId: item.workspaceId,
          path: workspace.localDir, displayTitle: workspace.projectName } },
          point ?? { x: rect.left, y: rect.bottom }, { button: `overleaf-workspace:${item.workspaceId}` });
      }
      const nativeIcons = require('@deepseek-ai/dsh-client-ui-primitives');
      ctx.slots.inject('contextMenu.icon', function* () {
        for (const [key, Icon] of Object.entries({
          'overleaf.link': nativeIcons.IconLinkOutlineRegular,
          'overleaf.new': nativeIcons.IconNewChatOutlineRegular,
          'overleaf.pause': nativeIcons.IconPauseOutlineRegular,
          'overleaf.refresh': nativeIcons.IconRefreshOutlineRegular,
        })) { if (Icon) yield ctx.slots.register({ name: 'contextMenu.icon', key }, Icon); }
      });
      const removeWorkspaceMenu = (ctx.get?.('contextMenus') ?? ctx.contextMenus)?.register({
        id: 'overleaf.workspace-tools', target: 'workspace', order: 250,
        observe: () => [ctx.workspaces.list],
        resolve: ({ workspaceId }) => {
          const workspace = snapshot.workspaces.find((record) => workspaceItemOf(ctx, record.localDir)?.workspaceId === workspaceId);
          if (workspace === undefined) return [];
          const running = ['connected', 'connecting', 'reconnecting'].includes(workspace.phase);
          const children = [
            { id: 'status', label: subtitle(workspace), disabled: true },
            { id: 'connect', label: running ? '断开连接' : '连接并同步', icon: { key: 'overleaf.link' }, run: () => toggleSync(workspace) },
            { id: 'new', label: '新建会话', icon: { key: 'overleaf.new' }, run: () => startNewSession(workspace) },
          ];
          if (workspace.phase === 'connected') {
            children.push({ id: 'pause', label: workspace.paused ? '恢复自动推送' : '暂停自动推送', icon: { key: 'overleaf.pause' },
              run: () => runAction(workspace, 'pause', () => api('live', { local_path: workspace.localDir, action: workspace.paused ? 'resume' : 'pause' })) },
              { id: 'flush', label: '立即同步本地改动', icon: { key: 'overleaf.refresh' },
                run: () => runAction(workspace, 'flush', () => api('live', { local_path: workspace.localDir, action: 'flush' })) });
          }
          children.push({ id: 'web', label: '在 Overleaf 中打开', icon: { key: 'overleaf.link' },
            run: () => { window.open(`${workspace.server}/project/${encodeURIComponent(workspace.projectId)}`, '_blank', 'noopener,noreferrer'); } },
            { id: 'manage', label: '管理工作区与账号', icon: { key: 'workspace.rename' }, run: () => ctx.layout.selectPanel(PANEL) });
          return children;
        },
      });
      let removalDialog;
      function confirmSessionRemoval(workspace, session) {
        removalDialog?.close(); removalDialog?.remove();
        const dialog = el('dialog', 'dsh-ol-sb-confirm');
        removalDialog = dialog;
        dialog.setAttribute('aria-labelledby', 'overleaf-remove-session-title');
        const heading = el('h2', '', '删除会话？'); heading.id = 'overleaf-remove-session-title';
        const name = el('p', 'dsh-ol-sb-confirm-name', sessionLabel(session));
        const description = el('p', '', '会话将归档并从 Overleaf 列表移除。Harness 历史日志和论文文件都会保留。');
        const error = el('p', 'dsh-ol-error'); error.setAttribute('role', 'alert'); error.hidden = true;
        const actions = el('div', 'dsh-ol-sb-confirm-actions');
        const cancel = el('button', '', '取消'); cancel.type = 'button'; cancel.autofocus = true;
        const confirm = el('button', 'danger', '删除会话'); confirm.type = 'button';
        let working = false;
        const close = () => { if (!working) { dialog.close(); dialog.remove(); removalDialog = undefined; } };
        cancel.addEventListener('click', close);
        dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
        confirm.addEventListener('click', async () => {
          if (working) return;
          const latest = sessionService(ctx)?.list?.getSnapshot?.().byId?.[session.id];
          if (latest?.running) { error.hidden = false; error.textContent = '请先停止此会话，再删除。'; return; }
          working = true; cancel.disabled = true; confirm.disabled = true; confirm.textContent = '删除中…'; error.hidden = true;
          let archived = false;
          try {
            await ctx.uiWorkspace.archiveSession(session.id); archived = true;
            await api('forgetSession', { local_path: workspace.localDir, session_id: session.id });
            await refresh();
            working = false; close(); render();
          } catch (reason) {
            error.hidden = false;
            error.textContent = `${archived ? '会话已归档，但移除未完成：' : ''}${errorText(reason)}`;
          } finally {
            working = false; cancel.disabled = false; confirm.disabled = false; confirm.textContent = '删除会话';
          }
        });
        actions.append(cancel, confirm); dialog.append(heading, name, description, error, actions);
        document.body.append(dialog); dialog.showModal();
      }
      const removeDeleteMenu = (ctx.get?.('contextMenus') ?? ctx.contextMenus)?.register({
        id: 'overleaf.remove-session', target: 'session', order: 700,
        observe: () => [ctx.workspaces.list, sessionService(ctx).list],
        resolve: ({ sessionId }) => {
          const workspace = snapshot.workspaces.find((item) => workspaceItemOf(ctx, item.localDir)?.sessionIds.includes(sessionId));
          if (workspace === undefined || removedWorkspaceSessions.get(workspace.localDir)?.has(sessionId)) return [];
          const session = sessionService(ctx)?.list?.getSnapshot?.().byId?.[sessionId];
          if (session === undefined || session.blank) return [];
          return [{ id: 'delete', label: '删除会话', danger: true, afterContent: true, separatorBefore: true,
            disabled: session.running === true, run: () => confirmSessionRemoval(workspace, session) }];
        },
      });

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
        return '本地工作区 · 未连接';
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

      // The Overleaf section groups each directory with its conversations.
      // Hide duplicate native rows for those same registered workspaces.
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
        closeMenu();
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

      function startNewSession(workspace) {
        if (workspaceItemOf(ctx, workspace.localDir) === undefined) {
          setFlash('error', '工作区尚未就绪，请稍后重试。');
          return Promise.resolve();
        }
        return runAction(workspace, 'new', async () => {
          await openProject(workspace, { fresh: true });

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

      /** Push what is pending, then close the socket and the directory watcher. */
      function toggleSync(workspace) {
        const running = workspace.phase === 'connected' || workspace.phase === 'connecting'
          || workspace.phase === 'reconnecting';
        return runAction(workspace, 'live', async () => {
          await api('live', { local_path: workspace.localDir, action: running ? 'stop' : 'start' });

        });
      }

      function render() {
        frame = undefined;
        if (disposed) return;
        // Native menus retain their trigger for focus and dismissal. Keep its
        // DOM node alive until the menu closes instead of rebuilding the list.
        const activeMenu = (ctx.get?.('contextMenus') ?? ctx.contextMenus)?.active?.getSnapshot?.();
        if (['session', 'workspace'].includes(activeMenu?.kind) && host.childElementCount > 0) return;
        const list = host.closest('[class*="scrollArea"]');
        const savedListScroll = list?.scrollTop;
        const previousBody = host.querySelector('.dsh-ol-sb-body');
        const savedScroll = previousBody?.scrollTop ?? 0;
        host.replaceChildren();

        const head = el('div', 'dsh-ol-sb-head');
        const sectionToggle = el('button', 'dsh-ol-sb-section-toggle');
        sectionToggle.type = 'button'; sectionToggle.setAttribute('aria-expanded', String(!collapsed));
        sectionToggle.setAttribute('aria-label', collapsed ? '展开 Overleaf' : '折叠 Overleaf');
        sectionToggle.append(icon('chevron-right-outline-regular'), el('span', '', 'Overleaf'));
        sectionToggle.addEventListener('click', () => {
          closeMenu(); collapsed = !collapsed;
          try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch { /* Storage is optional. */ }
          render();
        });
        head.append(sectionToggle,
          iconButton('settings-outline-regular', '管理 Overleaf 工作区与账号', () => ctx.layout.selectPanel(PANEL)),
          iconButton('project-add-outline-regular', '从已有项目创建本地工作区', () => ctx.layout.selectPanel(PANEL)));

        const body = el('div', 'dsh-ol-sb-body');
        body.setAttribute('role', 'tree'); body.setAttribute('aria-label', 'Overleaf 工作区与会话');
        if (collapsed) body.style.display = 'none';

        const visibleWorkspaces = snapshot.workspaces.filter((record) => workspaceItemOf(ctx, record.localDir) !== undefined);
        if (visibleWorkspaces.length === 0) {
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
        for (const record of visibleWorkspaces) {
          const nativeTitle = workspaceItemOf(ctx, record.localDir)?.title?.trim();
          const folderName = record.localDir.replace(/\/+$/u, '').split('/').pop();
          const workspace = { ...record, projectName: nativeTitle && nativeTitle !== folderName ? nativeTitle : record.projectName };
          const running = ['connected', 'connecting', 'reconnecting'].includes(workspace.phase);
          const expanded = !closedProjects.has(workspace.localDir);
          const row = el('div', 'dsh-ol-sb-row');
          row.dataset.localDir = workspace.localDir;
          row.setAttribute('role', 'treeitem'); row.setAttribute('aria-expanded', String(expanded));
          row.setAttribute('aria-label', workspace.projectName); row.tabIndex = 0;
          row.title = `${workspace.projectName}\n${subtitle(workspace)}\n${workspace.localDir}`;
          if (busy !== '') row.setAttribute('aria-disabled', 'true');
          const leading = el('button', 'dsh-ol-sb-leading');
          leading.type = 'button'; leading.setAttribute('aria-expanded', String(expanded));
          leading.setAttribute('aria-label', `${expanded ? '折叠' : '展开'} ${workspace.projectName} 的会话`);
          leading.append(icon(expanded ? 'folder-open-regular' : 'folder-close-regular', 'dsh-ol-sb-folder'), icon('triangle-right-fill-regular', 'dsh-ol-sb-arrow'));
          if (running || workspace.phase === 'error') leading.append(el('span', `dsh-ol-sb-status ${workspace.phase}`));
          leading.addEventListener('click', (event) => { event.stopPropagation(); closeMenu(); toggleProject(workspace); });
          const actions = el('span', 'dsh-ol-sb-actions');
          const more = iconButton('ellipsis-outline-regular', `更多操作：${workspace.projectName}`, (event) => openMenu(workspace, event.currentTarget));
          more.setAttribute('data-context-menu-trigger', '');
          more.setAttribute('aria-haspopup', 'menu'); more.setAttribute('aria-expanded', 'false');
          const connect = iconButton('link-outline-regular', `${running ? '断开连接' : '连接并同步'}：${workspace.projectName}`, () => { void toggleSync(workspace); });
          if (running) connect.classList.add('connected');
          const create = iconButton('new-chat-outline-regular', `新建会话：${workspace.projectName}`, () => { void startNewSession(workspace); });
          for (const button of [more, connect, create]) { button.disabled = busy !== '' || (button !== more && !workspace.bound); actions.append(button); }
          row.append(leading, el('span', 'dsh-ol-sb-title', workspace.projectName), actions);
          const enter = () => { closeMenu(); toggleProject(workspace); };
          row.addEventListener('click', enter);
          row.addEventListener('contextmenu', (event) => { event.preventDefault(); openMenu(workspace, more, { x: event.clientX, y: event.clientY }); });
          row.addEventListener('keydown', (event) => {
            if (event.target !== row) return;
            if (event.key === 'ArrowRight' && !expanded || event.key === 'ArrowLeft' && expanded) {
              event.preventDefault(); toggleProject(workspace); return;
            }
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault(); enter();
          });
          body.append(row);
          if (!expanded) continue;
          const conversations = el('div', 'dsh-ol-sb-sessions'); conversations.setAttribute('role', 'group');
          const current = ctx.uiWorkspace?.selection?.getSnapshot?.().sessionId;
          const nativeMenu = ctx.get?.('contextMenus') ?? ctx.contextMenus;
          const activeMenu = nativeMenu?.active?.getSnapshot?.();
          for (const session of sessionsOfWorkspace(ctx, workspace.localDir)) {
            const menuOpen = activeMenu?.kind === 'session' && activeMenu.value.sessionId === session.id;
            const button = el('div', `dsh-ol-sb-session${session.id === current ? ' current' : ''}${menuOpen ? ' menu-open' : ''}`);
            button.dataset.sessionId = session.id; button.tabIndex = 0;
            button.setAttribute('role', 'treeitem'); button.setAttribute('aria-selected', String(session.id === current));
            button.title = sessionLabel(session); button.setAttribute('aria-current', session.id === current ? 'true' : 'false');
            button.append(el('span', 'dsh-ol-sb-title', sessionLabel(session)), el('span', 'dsh-ol-sb-time', compactTime(session.updatedAt)));
            const open = () => {
              if (busy !== '' || !workspace.bound) return;
              void runAction(workspace, 'session', () => openProject(workspace, { sessionId: session.id }));
            };
            button.addEventListener('click', open);
            if (session.blank !== true) {
              const actions = el('span', 'dsh-ol-sb-session-actions');
              const more = iconButton('ellipsis-outline-regular', `会话操作：${sessionLabel(session)}`, (event) => {
                openSessionMenu(session, event.currentTarget);
              });
              more.setAttribute('data-context-menu-trigger', '');
              more.setAttribute('aria-haspopup', 'menu'); more.setAttribute('aria-expanded', String(menuOpen));
              more.disabled = busy !== '';
              actions.append(more); button.append(actions);
              button.addEventListener('contextmenu', (event) => {
                event.preventDefault(); openSessionMenu(session, more, { x: event.clientX, y: event.clientY });
              });
            }
            button.addEventListener('keydown', (event) => {
              if (event.target !== button || event.isComposing) return;
              if (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) {
                event.preventDefault();
                const more = button.querySelector('[aria-haspopup=menu]');
                if (more) openSessionMenu(session, more);
              } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
            });
            conversations.append(button);
          }
          body.append(conversations);
        }

        host.append(head);
        if (!collapsed) host.append(body);
        if (savedScroll > 0) body.scrollTop = savedScroll;
        // Replacing this section briefly shrinks the shared scroll container.
        // Restore its position after the complete list is back in place.
        if (list !== null && savedListScroll !== undefined) list.scrollTop = savedListScroll;
      }

      const schedule = () => { if (!disposed && frame === undefined) frame = setTimeout(render, 0); };

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
      const unsubscribeSessions = sessionService(ctx)?.list?.subscribe?.(() => schedule());
      const unsubscribeSessionMenu = (ctx.get?.('contextMenus') ?? ctx.contextMenus)?.active?.subscribe?.(() => {
        const active = (ctx.get?.('contextMenus') ?? ctx.contextMenus)?.active?.getSnapshot?.();
        const ownWorkspace = active?.kind === 'workspace' && snapshot.workspaces.some((record) =>
          workspaceItemOf(ctx, record.localDir)?.workspaceId === active.value.workspaceId);
        document.documentElement.classList.toggle('dsh-overleaf-flat-workspace-menu', ownWorkspace);
        for (const row of host.querySelectorAll('.dsh-ol-sb-session')) {
          const opened = active?.kind === 'session' && active.value.sessionId === row.dataset.sessionId;
          row.classList.toggle('menu-open', opened);
          row.querySelector('[aria-haspopup=menu]')?.setAttribute('aria-expanded', String(opened));
        }
        for (const row of host.querySelectorAll('.dsh-ol-sb-row')) {
          const item = workspaceItemOf(ctx, row.dataset.localDir);
          const opened = active?.kind === 'workspace' && active.value.workspaceId === item?.workspaceId;
          row.classList.toggle('menu-open', opened);
          row.querySelector('[aria-haspopup=menu]')?.setAttribute('aria-expanded', String(opened));
        }
        if (!['session', 'workspace'].includes(active?.kind)) schedule();
      });
      let unsubscribeSelection;
      try {
        unsubscribeSelection = ctx.uiWorkspace.selection?.subscribe?.(() => { syncMode(); schedule(); });
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
        refreshLayout() { layout.refresh(); },
        dispose() {
          closeMenu();
          removalDialog?.close(); removalDialog?.remove();
          removeDeleteMenu?.();
          removeWorkspaceMenu?.();
          disposed = true;
          observer.disconnect();
          unsubscribe?.();
          unsubscribeSessions?.();
          unsubscribeSessionMenu?.();
          document.documentElement.classList.remove('dsh-overleaf-flat-workspace-menu');
          unsubscribeSelection?.();
          clearInterval(timer);
          clearInterval(tidyTimer);
          clearTimeout(flashTimer);
          if (frame !== undefined) clearTimeout(frame);
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
        const waitFor = async (predicate, timeout = 600, step = 20) => {
          const end = Date.now() + timeout;
          while (Date.now() < end) {
            if (predicate()) return true;
            await wait(step);
          }
          return predicate();
        };
        // Optional services are looked up dynamically: declaring them in `inject`
        // would keep the whole plugin (panel and sidebar section included) pending
        // if a deployment does not provide them.
        const sidebarService = () => ctx.get?.('sidebarRight');

        const workspaceIdFor = (localDir) => (ctx.workspaces.list.getSnapshot?.().items ?? [])
          .find((item) => item.path === localDir)?.workspaceId;

        /** Open a path in the pane that does not hold the Files tree. */
        const openInEditor = (absolutePath, path) => {
          const service = sidebarService();
          const sessionId = service?.mounted?.getSnapshot?.();
          if (typeof sessionId !== 'string') return false;
          rememberSession(sessionId, absolutePath);
          const tabs = service.tabsIn?.(sessionId) ?? [];
          const filesTab = tabs.find((tab) => tab.kind === 'files');
          const filesPane = filesTab === undefined ? undefined : paneOfTab(filesTab.id);
          const editorPane = filesPane === undefined ? undefined
            : visibleDockPanes().find((candidate) => candidate !== filesPane);
          try {
            service.openResource(fileAddress(sessionId, path), editorPane === undefined
              ? { preferNewPane: true }
              : { paneId: editorPane.dataset.dockkitPane });
            return true;
          } catch (error) {
            console.warn('[dsh-overleaf-workshop] new file could not open:', error);
            return false;
          }
        };

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
            if (filesPane !== undefined) {
              const splitId = sidebar.split?.(filesPane.dataset.dockkitPane);
              if (typeof splitId === 'string') {
                await waitFor(() => visibleDockPanes().length >= 2);
              } else if (actions?.splitPane !== undefined) {
                try { actions.splitPane(sessionId, filesPane.dataset.dockkitPane); } catch { /* no room to split */ }
                await waitFor(() => visibleDockPanes().length >= 2);
              }
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
          await sidebarSection?.refresh();

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
          // Establish the second pane before opening anything, then name it
          // explicitly. Otherwise the first resource lands in the tree pane and
          // only moves after arrangePanes runs, which is visible to the user.
          let editorPane;
          {
            const tabs = sidebar.tabsIn?.(sessionId) ?? [];
            const filesTab = tabs.find((tab) => tab.kind === 'files');
            const filesPane = filesTab === undefined ? undefined : paneOfTab(filesTab.id);
            if (filesPane !== undefined) {
              editorPane = visibleDockPanes().find((candidate) => candidate !== filesPane);
              if (editorPane === undefined) {
                const splitId = sidebar.split?.(filesPane.dataset.dockkitPane);
                if (typeof splitId === 'string') {
                  await waitFor(() => visibleDockPanes().length >= 2);
                  editorPane = visibleDockPanes().find((candidate) => candidate !== filesPane);
                }
              }
            }
          }
          const editorPaneId = editorPane?.dataset.dockkitPane;
          if (info?.hasPdf === true) {
            await attempt(() => sidebar.openResource(fileAddress(sessionId, 'output.pdf'),
              editorPaneId !== undefined ? { paneId: editorPaneId } : { preferNewPane: true }));
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
            if (options.replaceTab === undefined && editorPaneId !== undefined) options.paneId = editorPaneId;
            else if (options.replaceTab === undefined && visibleDockPanes().length < 2) options.preferNewPane = true;
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
          // Keep the workspace's conversations visible during editing.
          sidebarSection?.refreshLayout();
        }

        /** Open a workspace record from the panel or sidebar section, registering it when needed. */
        async function openRecord(record, options = {}) {
          const list = document.querySelector('.dsh-ol-sb')?.closest('[class*="scrollArea"]');
          const scrollTop = list?.scrollTop;
          let userScrolled = false;
          const onInput = () => { userScrolled = true; };
          const restore = () => {
            if (!userScrolled && list !== undefined && scrollTop !== undefined && list.scrollTop !== scrollTop) {
              list.scrollTop = scrollTop;
            }
          };
          // Native navigation may scroll its duplicate workspace row into view.
          // Hold the visible list steady unless the user starts scrolling.
          for (const event of ['wheel', 'touchmove', 'pointerdown', 'keydown']) {
            list?.addEventListener(event, onInput, { passive: true });
          }
          list?.addEventListener('scroll', restore);
          try {
            const opened = await api('open', { base_url: record.server, project_id: record.projectId,
              project_name: record.projectName, local_path: record.localDir });
            const workspaceId = opened.workspaceId ?? workspaceIdFor(record.localDir);
            if (workspaceId === undefined) throw new Error('工作区尚未就绪，请稍后重试。');
            await enterWorkspace(workspaceId, record.localDir, options);
          } finally {
            restore();
            list?.removeEventListener('scroll', restore);
            for (const event of ['wheel', 'touchmove', 'pointerdown', 'keydown']) {
              list?.removeEventListener(event, onInput);
            }
          }
        }

        /**
         * The built-in file tree opens a file in whichever dock pane is active.
         * Clicking a row makes the tree's pane active, which would put the file
         * back into the directory column. Focus the editor pane in the capture
         * phase instead, before the tree's own click handler runs.
         */
        const installFilePaneGuard = () => {
          const scheduleSplitRatio = (sessionId) => {
            const actions = findPaneActions(sessionId);
            if (actions?.resizeSplit === undefined) return;
            setTimeout(() => {
              const filesTab = (sidebarService()?.tabsIn?.(sessionId) ?? [])
                .find((tab) => tab.kind === 'files');
              const filesPane = filesTab === undefined ? undefined : paneOfTab(filesTab.id);
              const split = filesPane?.closest('[data-dockkit-split]');
              if (split === null || split === undefined) return;
              try {
                actions.resizeSplit(sessionId, split.dataset.dockkitSplit,
                  [FILES_PANE_RATIO, 1 - FILES_PANE_RATIO]);
              } catch { /* keep the default split */ }
            }, 60);
          };

          let contextMenu;
          let contextTarget;

          const closeContextMenu = () => {
            contextMenu?.remove();
            contextMenu = undefined;
            contextTarget = undefined;
          };

          const dispatchCreate = (kind) => {
            const target = contextTarget;
            closeContextMenu();
            if (target === undefined) return;
            const wrapper = target.pane.querySelector('.dsh-ol-fa');
            if (wrapper === null) return;
            wrapper.dispatchEvent(new CustomEvent('dsh-overleaf-create', {
              detail: { absolutePath: target.root, kind, directoryRel: target.directoryRel },
            }));
          };

          const showContextMenu = (event, target) => {
            closeContextMenu();
            contextTarget = target;
            contextMenu = document.createElement('div');
            contextMenu.className = 'dsh-ol-tree-menu';
            contextMenu.setAttribute('role', 'menu');
            for (const [kind, label, folder] of [['file', '在此处新建文件', false], ['folder', '在此处新建文件夹', true]]) {
              const button = document.createElement('button');
              button.type = 'button';
              button.dataset.dshCreateKind = kind;
              button.setAttribute('role', 'menuitem');
              button.append(makeFileTreeIcon(folder ? 'folder' : 'file', false), document.createTextNode(label));
              button.addEventListener('click', (clickEvent) => {
                clickEvent.preventDefault();
                clickEvent.stopPropagation();
                dispatchCreate(kind);
              });
              contextMenu.append(button);
            }
            document.body.append(contextMenu);
            const margin = 6;
            const rect = contextMenu.getBoundingClientRect();
            const left = Math.min(event.clientX, window.innerWidth - rect.width - margin);
            const top = Math.min(event.clientY, window.innerHeight - rect.height - margin);
            contextMenu.style.left = `${Math.max(margin, left)}px`;
            contextMenu.style.top = `${Math.max(margin, top)}px`;
            contextMenu.querySelector('button')?.focus();
          };

          const onContextMenu = (event) => {
            const target = event.target instanceof Element ? event.target : undefined;
            const rootElement = target?.closest('[data-files-root]');
            if (rootElement === null || rootElement === undefined) return;
            const pane = rootElement.closest('[data-dockkit-pane]');
            const service = sidebarService();
            const sessionId = service?.mounted?.getSnapshot?.();
            if (pane === null || typeof sessionId !== 'string' || !isKnownSession(sessionId)) return;
            const tabs = service.tabsIn?.(sessionId) ?? [];
            const filesTab = tabs.find((tab) => tab.kind === 'files');
            if (filesTab === undefined || paneOfTab(filesTab.id) !== pane) return;
            const root = rootElement.getAttribute('data-files-root') ?? sessionDirs()[sessionId];
            if (typeof root !== 'string' || root.length === 0) return;
            const row = target.closest('li[data-files-entry][data-files-path]');
            const directoryRel = creationDirectory(root, row);
            if (directoryRel === undefined || pane.querySelector('.dsh-ol-fa') === null) return;
            event.preventDefault();
            event.stopPropagation();
            showContextMenu(event, { pane, root, directoryRel });
          };

          const onDocumentClick = (event) => {
            if (contextMenu !== undefined && !(event.target instanceof Node && contextMenu.contains(event.target))) {
              closeContextMenu();
            }
          };
          const onKeyDown = (event) => { if (event.key === 'Escape') closeContextMenu(); };
          const onScroll = () => closeContextMenu();

          const onClick = (event) => {
            if (event.button !== undefined && event.button !== 0) return;
            const target = event.target instanceof Element ? event.target : undefined;
            const row = target?.closest('li[data-files-entry="file"][data-files-path]');
            if (row === null || row === undefined) return;
            const absPath = row.getAttribute('data-files-path');
            if (absPath === null || absPath.length === 0) return;
            const pane = row.closest('[data-dockkit-pane]');
            if (pane === null) return;
            const service = sidebarService();
            const sessionId = service?.mounted?.getSnapshot?.();
            if (typeof sessionId !== 'string' || !isKnownSession(sessionId)) return;
            const tabs = service.tabsIn?.(sessionId) ?? [];
            const filesTab = tabs.find((tab) => tab.kind === 'files');
            if (filesTab === undefined || paneOfTab(filesTab.id) !== pane) return;

            // data-files-path is absolute. Convert it to the same session-relative
            // path the Sidebar's own tree uses; an absolute path would be rejected
            // by the host's workspace containment check.
            const rawRoot = row.closest('[data-files-root]')?.getAttribute('data-files-root')
              ?? sessionDirs()[sessionId];
            const abs = String(absPath).replace(/\\/g, '/');
            const root = typeof rawRoot === 'string' ? rawRoot.replace(/\\/g, '/').replace(/\/+$/u, '') : '';
            let rel;
            if (root.length > 0 && abs === root) return;
            if (root.length > 0 && abs.startsWith(`${root}/`)) rel = abs.slice(root.length + 1);
            else if (!abs.startsWith('/')) rel = abs;
            else return;
            if (rel.length === 0) return;
            const address = fileAddress(sessionId, rel);

            const panes = visibleDockPanes();
            const other = panes.find((candidate) => candidate !== pane);
            let editorPaneId = other?.dataset.dockkitPane;
            const actions = findPaneActions(sessionId);
            const existing = tabs.find((tab) => tab.contentId === address);
            let createdSplit = false;

            try {
              if (existing !== undefined) {
                const existingPane = paneOfTab(existing.id);
                if (existingPane === pane && editorPaneId !== undefined) {
                  actions?.placeTab?.(sessionId, existing.id, editorPaneId);
                } else if (existingPane === pane) {
                  const splitId = service.split?.(pane.dataset.dockkitPane);
                  if (typeof splitId === 'string') {
                    editorPaneId = splitId;
                    createdSplit = true;
                    actions?.placeTab?.(sessionId, existing.id, splitId);
                  }
                }
                service.focus?.(existing.id);
              } else if (editorPaneId !== undefined) {
                service.openResource(address, { paneId: editorPaneId });
              } else {
                // No second pane: let the controller split atomically and open
                // the resource in the new pane on its first render.
                service.openResource(address, { preferNewPane: true });
                createdSplit = true;
              }
            } catch { return; }

            // Only suppress the tree's own handler after the direct open worked.
            event.preventDefault();
            event.stopPropagation();
            if (createdSplit) scheduleSplitRatio(sessionId);
          };
          document.addEventListener('click', onClick, true);
          document.addEventListener('contextmenu', onContextMenu, true);
          document.addEventListener('click', onDocumentClick, true);
          document.addEventListener('keydown', onKeyDown, true);
          document.addEventListener('scroll', onScroll, true);
          return () => {
            document.removeEventListener('click', onClick, true);
            document.removeEventListener('contextmenu', onContextMenu, true);
            document.removeEventListener('click', onDocumentClick, true);
            document.removeEventListener('keydown', onKeyDown, true);
            document.removeEventListener('scroll', onScroll, true);
            closeContextMenu();
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
              keepMounted: true,
              title: (address) => basenameOf(parseFileAddress(address)?.path ?? address),
            }), 'dsh-overleaf: source tab type');
            ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
              name: 'sidebar.right.pane.tab',
              key: 'dsh-overleaf/source',
              children: {
                'overleaf.source.pdf': {
                  kind: 'keyed', scope: 'session',
                  inject: { hooks: { tabInfo: (_standard, useTabInfo) => useTabInfo } },
                },
              },
              inject: () => ({ api, readPdf: pdfReader(ctx) }),
            }, SourceTab)), 'dsh-overleaf: source tab body');
            // The document slot is owned by the host. Reuse its PDF registration
            // in our own slot instead of redeclaring that global child slot.
            ctx.effect(() => {
              const host = ctx.slots.hostFace();
              let entry;
              let dispose;
              const sync = () => {
                const next = host.entriesOfSlot('sidebar.right.tab.document')
                  .find((item) => item.options.key === '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/pdf');
                if (next === entry) return;
                dispose?.();
                entry = next;
                dispose = next === undefined ? undefined : ctx.slots.register({
                  name: 'overleaf.source.pdf', key: next.options.key,
                  locale: next.locale, store: next.store, inject: next.inject,
                }, next.component);
              };
              const unsubscribe = host.subscribe('sidebar.right.tab.document', sync);
              sync();
              return () => { unsubscribe(); dispose?.(); };
            }, 'dsh-overleaf: embedded PDF renderer');
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

        try {
          ctx.slots.inject('sidebar.right.tab.files.actions', () => ctx.slots.register({
            name: 'sidebar.right.tab.files.actions',
            id: 'dsh-overleaf/files-actions',
            order: -10,
            inject: () => ({ api, openInEditor }),
          }, FilesActions));
        } catch (error) {
          console.warn('[dsh-overleaf-workshop] files actions slot unavailable:', error);
        }

        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL,
          inject: () => ({ services: { ctx, api, enterWorkspace, openRecord } }) }, OverleafPanel));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist',
          id: PANEL, order: -9, label: 'Overleaf' }, Icon));
      },
    };
  },
});
