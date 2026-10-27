/**
 * Model-facing tools for the Overleaf workspace.
 *
 * Every tool takes the local workspace path (as returned by `overleaf_projects`
 * or shown in the panel). Everything else — reading, editing, searching — stays
 * with the harness's normal tools, because an Overleaf workspace is a plain
 * local directory.
 *
 * @module dsh-overleaf/tools
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { renderCompileResult } from './compile.js';
import { CookieExpiredError } from './api.js';
import { readProjectState } from './store.js';

/** The harness home, used for persistence and the project mirror. */
export function dshHome() {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh');
}

/** Wrap sync/API failures so the model sees an actionable message. */
function friendly(error) {
  if (error instanceof CookieExpiredError) return error.message;
  return error?.message ?? String(error);
}

/**
 * Register the Overleaf tools.
 * @param ctx - registrant context carrying `ctx.tools`.
 * @param host - loaded host modules (`tools`).
 * @param runtime - shared plugin runtime.
 */
export function registerOverleafTools(ctx, host, runtime) {
  const { defineTool } = host.tools;

  const textTool = (spec, execute) => ctx.tools.register(defineTool({
    ...spec,
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args, exec) {
      try {
        return await execute(args, exec);
      } catch (error) {
        runtime.ctx?.logger?.warn?.('overleaf: tool %s failed: %s', spec.name, error?.stack ?? error);
        throw new Error(friendly(error));
      }
    },
  }));

  textTool({
    name: 'overleaf_projects',
    description:
      'List the Overleaf servers with a stored session and the Overleaf projects opened as local workspaces. '
      + 'Use this before the other overleaf_* tools to find the workspace path of a project.',
    parameters: {},
    async execute() {
      const projects = runtime.projectTable.list();
      const servers = runtime.secrets.list();
      const lines = [];
      lines.push(servers.length === 0
        ? 'No Overleaf server has a session yet. Ask the user to paste their browser cookie in the 「Overleaf」 panel.'
        : 'Servers:');
      for (const server of servers) {
        lines.push(`- ${server.origin}${server.loggedIn ? ` (${server.email || 'logged in'})` : ' (no session)'}`);
      }
      lines.push('', projects.length === 0
        ? 'No Overleaf projects opened as workspaces. Open one from the 「Overleaf」 panel first.'
        : 'Opened projects (workspace path -> project):');
      for (const project of projects) {
        lines.push(`- ${project.localDir}  =>  ${project.server} · ${project.projectName} (${project.projectId})`);
      }
      return lines.join('\n');
    },
  });

  textTool({
    name: 'overleaf_status',
    description:
      'Show which files in an Overleaf workspace changed locally since the last pull: added, modified or deleted. '
      + 'Read-only and fast; use it before overleaf_push or overleaf_pull.',
    parameters: {
      workspace_path: {
        type: 'string', required: true,
        description: 'Absolute path of the local Overleaf workspace (from overleaf_projects).',
      },
    },
    async execute(args) {
      const status = runtime.sync.status(String(args.workspace_path));
      const count = status.added.length + status.changed.length + status.deleted.length;
      const lines = [
        `${status.projectName} (${status.server})`,
        `上次拉取：${status.pulledAt ?? '从未'}`,
        '',
        count === 0 ? '本地自上次拉取以来没有改动。' : '本地改动:',
      ];
      for (const path of status.added) lines.push(`+ ${path}`);
      for (const path of status.changed) lines.push(`~ ${path}`);
      for (const path of status.deleted) lines.push(`- ${path}`);
      if (count > 0) lines.push('', '用 overleaf_push 推送这些改动，或 overleaf_pull 放弃本地改动（有改动且远端也变了的文件会报告冲突）。');
      return lines.join('\n');
    },
  });

  textTool({
    name: 'overleaf_pull',
    description:
      'Snapshot fallback: download the whole project zip into the local workspace. Files not modified locally are '
      + 'overwritten; locally modified files are kept; files changed on both sides are reported as conflicts. '
      + 'Stop real-time sync (overleaf_live action=stop) before using this.',
    parameters: {
      workspace_path: {
        type: 'string', required: true,
        description: 'Absolute path of the local Overleaf workspace.',
      },
    },
    async execute(args, exec) {
      const result = await runtime.sync.pull(String(args.workspace_path), { signal: exec.signal });
      const lines = [`已拉取 ${result.projectName}:`];
      for (const path of result.updated) lines.push(`~ 更新 ${path}`);
      for (const path of result.newRemote) lines.push(`+ 新增 ${path}`);
      for (const path of result.removed) lines.push(`- 删除 ${path}`);
      for (const path of result.conflicts) lines.push(`! 冲突（远端与本地都改了，保留了本地版本）: ${path}`);
      if (result.updated.length + result.newRemote.length + result.removed.length + result.conflicts.length === 0) {
        lines.push('远端没有变化。');
      }
      if (result.conflicts.length > 0) {
        lines.push('', '冲突文件保留了本地版本。可以让用户决定：用 overleaf_push 覆盖远端，或手动合并后再次 pull。');
      }
      return lines.join('\n');
    },
  });

  textTool({
    name: 'overleaf_push',
    description:
      'Snapshot fallback: upload local changes with whole-file uploads instead of OT. Modified/added files are '
      + 'uploaded, locally deleted files are deleted remotely; remote files changed since the last pull are '
      + 'overwritten. Stop real-time sync before using this; prefer it only when live sync is unavailable.',
    parameters: {
      workspace_path: {
        type: 'string', required: true,
        description: 'Absolute path of the local Overleaf workspace.',
      },
      dry_run: {
        type: 'boolean',
        description: 'List what would be uploaded/deleted without contacting more than the file tree.',
      },
    },
    async execute(args, exec) {
      const result = await runtime.sync.push(String(args.workspace_path),
        { dryRun: args.dry_run === true, signal: exec.signal });
      if (result.dryRun) {
        const lines = [`推送计划（未上传）for ${result.projectName}:`];
        for (const path of result.upload) lines.push(`~ 上传 ${path}`);
        for (const path of result.delete) lines.push(`- 删除 ${path}`);
        if (result.upload.length + result.delete.length === 0) lines.push('没有需要推送的改动。');
        return lines.join('\n');
      }
      const lines = [`已推送到 Overleaf：${result.projectName}`];
      for (const path of result.uploaded) lines.push(`~ 上传 ${path}`);
      for (const path of result.deleted) lines.push(`- 删除 ${path}`);
      for (const path of result.overwrote) lines.push(`! 覆盖了远端改动 ${path}`);
      if (result.skipped.length > 0) lines.push(`跳过（本地已不存在）: ${result.skipped.join(', ')}`);
      if (result.uploaded.length + result.deleted.length === 0) lines.push('没有需要推送的改动。');
      return lines.join('\n');
    },
  });

  textTool({
    name: 'overleaf_live',
    description:
      'Inspect or control the real-time two-way sync of an Overleaf workspace. While it runs, edits made in '
      + 'the workspace (by you or the user) are pushed to Overleaf as OT updates within a moment, and edits '
      + 'made by collaborators on Overleaf appear in the local files. Pause to keep local edits local; '
      + 'stop before switching to the snapshot tools overleaf_pull/overleaf_push.',
    parameters: {
      workspace_path: {
        type: 'string', required: true,
        description: 'Absolute path of the local Overleaf workspace.',
      },
      action: {
        type: 'string', required: true,
        description: 'start, stop, pause, resume, or status.',
        enum: ['start', 'stop', 'pause', 'resume', 'status'],
      },
    },
    async execute(args) {
      const localDir = String(args.workspace_path);
      const action = String(args.action ?? 'status');
      if (action === 'start') await runtime.live.start(localDir);
      else if (action === 'stop') await runtime.live.stop(localDir);
      else if (action === 'pause') runtime.live.setPaused(localDir, true);
      else if (action === 'resume') runtime.live.setPaused(localDir, false);
      const status = runtime.live.status(localDir);
      const lines = [
        `实时同步：${status.phase}${status.paused ? '（已暂停推送）' : ''}`,
        `项目：${status.projectName ?? '?'}（${status.projectId ?? '?'}）`,
        `已加入文档：${status.joinedDocs}，在线协作者：${status.collaborators}，待推送：${status.pending}`,
      ];
      if (status.lastRemoteAt) lines.push(`最近远端改动：${status.lastRemoteAt}`);
      if (status.lastPushAt) lines.push(`最近本地推送：${status.lastPushAt}`);
      if (status.error) lines.push(`错误：${status.error}`);
      return lines.join('\n');
    },
  });

  textTool({
    name: 'overleaf_compile',
    description:
      'Compile an Overleaf workspace on the Overleaf servers and download the result. Writes output.pdf and '
      + 'output.log into the workspace and returns a parsed list of LaTeX errors and warnings with file and line, '
      + 'so you can fix the sources and recompile. output.pdf can be previewed from the sidebar files list.',
    parameters: {
      workspace_path: {
        type: 'string', required: true,
        description: 'Absolute path of the local Overleaf workspace.',
      },
      main_file: {
        type: 'string',
        description: 'Root .tex file relative to the project root, e.g. main.tex. Defaults to main.tex, else the shallowest .tex.',
      },
    },
    async execute(args, exec) {
      const localDir = String(args.workspace_path);
      const state = readProjectState(localDir);
      if (state === undefined) throw new Error('这个目录不是 Overleaf 工作区。');
      const client = runtime.createClient(state.server);
      const result = await runtime.compile(client, localDir, { mainFile: args.main_file, signal: exec.signal });
      return renderCompileResult(result, { localDir });
    },
  });
}
