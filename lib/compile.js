/**
 * Compile a project on Overleaf, download the outputs into the workspace, and
 * turn `output.log` into a compact error/warning list the agent can act on.
 *
 * The PDF is written to `<dir>/output.pdf` so the built-in sidebar preview can
 * open it like any other workspace file.
 *
 * @module dsh-overleaf/compile
 */

import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OverleafError } from './api.js';
import { isIgnoredPath, readProjectState } from './store.js';

/** Pick the root resource: `main.tex` if present, else the shallowest `.tex`. */
export function guessMainFile(localDir) {
  const files = [];
  const walk = (dir, prefix, depth) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const path = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
      if (isIgnoredPath(path)) continue;
      if (entry.isDirectory()) walk(join(dir, entry.name), path, depth + 1);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.tex')) files.push({ path, depth });
    }
  };
  walk(localDir, '', 0);
  if (files.length === 0) return undefined;
  const main = files.find(file => file.path.toLowerCase() === 'main.tex');
  if (main !== undefined) return main.path;
  files.sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path));
  return files[0].path;
}

/**
 * One compile round trip: request, download pdf + log, parse the log.
 * @returns `{ status, pdfPath, logPath, mainFile, errors, warnings, badBoxes, rawLogLines }`.
 */
export async function compileProject(client, localDir, { mainFile, signal } = {}) {
  const state = readProjectState(localDir);
  if (state?.projectId === undefined) {
    throw new OverleafError('这个目录不是 Overleaf 工作区（缺少 .overleaf/state.json）。');
  }
  const root = mainFile ?? guessMainFile(localDir);
  if (root === undefined) {
    throw new OverleafError('项目里没有找到 .tex 文件，无法确定主文件。');
  }
  if (typeof root !== 'string' || root.length === 0 || root.startsWith('/')
    || root.split(/[\\/]/u).includes('..') || !root.toLowerCase().endsWith('.tex')) {
    throw new OverleafError('主文件必须是项目目录内的 .tex 文件。');
  }
  const compile = await client.compile(state.projectId, root, { signal });
  const outputs = Array.isArray(compile?.outputFiles) ? compile.outputFiles : [];
  const find = (name) => outputs.find(file => file.path === name || file.path.endsWith(`/${name}`));

  const result = {
    status: compile?.status ?? 'unknown',
    mainFile: root,
    errors: [],
    warnings: [],
    badBoxes: [],
    pdfPath: undefined,
    logPath: undefined,
  };

  const pdf = find('output.pdf');
  const log = find('output.log');
  const outDir = join(localDir, '.overleaf', 'output');
  if (pdf !== undefined) {
    const data = await client.downloadOutput(state.projectId, pdf, compile);
    mkdirSync(outDir, { recursive: true });
    // The preview-visible copy sits at the project root, next to the sources.
    writeFileSync(join(localDir, 'output.pdf'), data, { mode: 0o644 });
    result.pdfPath = join(localDir, 'output.pdf');
  }
  if (log !== undefined) {
    const data = await client.downloadOutput(state.projectId, log, compile);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(localDir, 'output.log'), data, { mode: 0o644 });
    result.logPath = join(localDir, 'output.log');
    const parsed = parseLog(new TextDecoder('utf8', { fatal: false }).decode(data));
    result.errors = parsed.errors;
    result.warnings = parsed.warnings;
    result.badBoxes = parsed.badBoxes;
  }

  if (compile?.status === 'failure' && result.errors.length === 0) {
    result.errors.push({ message: '编译失败，但日志里没有解析到错误；请查看 output.log。' });
  }
  return result;
}

/**
 * Parse a LaTeX log into structured problems.
 *
 * Recognizes the three shapes users care about: `! ` errors with the following
 * `l.<n>` context, `file:line: message` error-style lines, `LaTeX Warning:` and
 * `Package ... Warning:` lines, and over/underfull box reports.
 */
export function parseLog(text) {
  const lines = text.split(/\r?\n/u);
  const errors = [];
  const warnings = [];
  const badBoxes = [];
  const normalize = (file) => (file && file !== './' ? file.replace(/\.\/|^\.\//u, '') : undefined);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (line.startsWith('! ')) {
      const error = { message: line.slice(2).trim(), file: undefined, line: undefined, context: [] };
      // The error block ends at the first blank line; scanning further would
      // steal file:line references from unrelated later errors.
      for (let j = i + 1; j < Math.min(i + 8, lines.length) && lines[j].trim().length > 0; j += 1) {
        if (lines[j].startsWith('! ')) break;
        const at = /^l\.(\d+)\s/u.exec(lines[j]);
        if (at !== null) error.line = Number(at[1]);
        const inline = /^(.*?\.(?:tex|sty|cls)):(\d+):\s/u.exec(lines[j]);
        if (inline !== null && error.file === undefined) {
          error.file = normalize(inline[1]);
          error.line = Number(inline[2]);
        }
        if (error.context.length < 3) error.context.push(lines[j].trim());
      }
      errors.push(error);
      continue;
    }

    const styled = /^(.+?\.(?:tex|sty|cls|ltx)):(\d+):\s(.+)$/u.exec(line);
    if (styled !== null) {
      errors.push({ file: normalize(styled[1]), line: Number(styled[2]), message: styled[3].trim(), context: [] });
      continue;
    }

    const warning = /^((?:LaTeX|Package \S+|Class \S+) Warning:.*)$/u.exec(line);
    if (warning !== null) {
      const detail = [];
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j += 1) {
        if (/^\(.*\)\s*$/u.test(lines[j]) || lines[j].startsWith('!')) break;
        if (/^\s{1,4}\S/u.test(lines[j])) detail.push(lines[j].trim());
        else break;
      }
      warnings.push({ message: warning[1], detail: detail.join(' ') });
      continue;
    }

    const box = /^(Overfull|Underfull) \\[hv]box \((.+?)\) (.+)$/u.exec(line);
    if (box !== null) {
      badBoxes.push({ kind: box[1] === 'Overfull' ? 'overfull' : 'underfull', size: box[2].trim(), message: box[3].trim() });
    }
  }
  return { errors, warnings, badBoxes };
}

/**
 * The Sidebar RPC contract: nullables are `null`, never `undefined`. A strict
 * result schema rejects a missing `pdfPath` or a `file`/`line` that a log line
 * did not carry, which would turn a useful failure list into an RPC error.
 */
export function toRpcCompileResult(result) {
  return {
    status: String(result?.status ?? 'unknown'),
    pdfPath: result?.pdfPath ?? null,
    errors: (result?.errors ?? []).map(error => ({
      file: error?.file ?? null,
      line: typeof error?.line === 'number' ? error.line : null,
      message: String(error?.message ?? ''),
    })),
    warnings: (result?.warnings ?? []).map(warning => ({ message: String(warning?.message ?? '') })),
  };
}

/** Render a compile result as the tool's text output. */export function renderCompileResult(result, { localDir } = {}) {
  const lines = [];
  const statusText = {
    success: '编译成功',
    failure: '编译失败（有错误）',
    error: '编译出错（服务器错误）',
    stopped: '编译被停止',
    unknown: `编译状态：${result.status}`,
  }[result.status] ?? `编译状态：${result.status}`;
  lines.push(statusText, `主文件：${result.mainFile}`);
  if (result.pdfPath !== undefined) {
    lines.push(`PDF 已更新：${result.pdfPath}`);
    if (localDir !== undefined) lines.push('在侧边栏「文件」中点击 output.pdf 即可预览。');
  } else if (result.status !== 'success') {
    lines.push('没有生成 PDF。');
  }
  if (result.errors.length > 0) {
    lines.push('', `错误（${result.errors.length}）:`);
    for (const error of result.errors.slice(0, 20)) {
      const where = [error.file, error.line !== undefined ? `行 ${error.line}` : undefined]
        .filter(Boolean).join(':');
      lines.push(`- ${where.length > 0 ? `${where}: ` : ''}${error.message}`);
      for (const context of error.context.slice(0, 2)) lines.push(`    ${context}`);
    }
  }
  if (result.warnings.length > 0) {
    lines.push('', `警告（${result.warnings.length}）:`);
    for (const warning of result.warnings.slice(0, 10)) {
      lines.push(`- ${warning.message}${warning.detail.length > 0 ? ` ${warning.detail}` : ''}`);
    }
  }
  if (result.badBoxes.length > 0) {
    lines.push('', `Over/Underfull 盒子（${result.badBoxes.length}）:`);
    for (const box of result.badBoxes.slice(0, 10)) lines.push(`- ${box.kind}: ${box.size} ${box.message}`);
  }
  if (result.errors.length === 0 && result.warnings.length === 0) lines.push('', '日志中没有错误或警告。');
  if (result.errors.length > 0) lines.push('', '请根据错误修改源文件，修改后可再次运行编译。');
  return lines.join('\n');
}
