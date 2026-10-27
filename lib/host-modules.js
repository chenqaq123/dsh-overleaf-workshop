/**
 * Loads the harness's own capability-seam modules.
 *
 * Same resolution strategy as the SSH plugin: the seam packages live inside the
 * installed application, importable by absolute path through Electron's asar.
 * Importing them from there keeps `extends Service` and `defineTool` on the same
 * class instances the rest of the composition uses.
 *
 * This plugin only registers tools, a service and a UI panel, so it needs just
 * `cordis` and `dsh-tools` — it deliberately leaves `ctx.fs` / `ctx.shell` alone
 * and can coexist with the SSH plugin.
 *
 * @module dsh-overleaf/host-modules
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Candidate `node_modules` roots that may contain the `@deepseek-ai` packages. */
function candidateRoots() {
  const roots = [];
  const fromEnv = process.env.DSH_HOST_MODULES;
  if (typeof fromEnv === 'string' && fromEnv.length > 0) roots.push(fromEnv);

  if (typeof process.resourcesPath === 'string' && process.resourcesPath.length > 0) {
    roots.push(join(process.resourcesPath, 'app.asar', 'dsh', 'node_modules'));
  }
  if (typeof process.execPath === 'string' && process.execPath.length > 0) {
    const contents = dirname(dirname(process.execPath));
    roots.push(join(contents, 'Resources', 'app.asar', 'dsh', 'node_modules'));
    roots.push(join(contents, 'resources', 'app.asar', 'dsh', 'node_modules'));
  }
  roots.push(resolve(process.cwd(), 'node_modules'));
  return [...new Set(roots)];
}

const REQUIRED = {
  cordis: 'cordis/lib/index.js',
  tools: 'dsh-tools/lib/index.js',
};

let cached;

export async function loadHostModules() {
  if (cached !== undefined) return cached;
  const failures = [];
  for (const root of candidateRoots()) {
    const scope = join(root, '@deepseek-ai');
    if (!existsSync(scope)) continue;
    try {
      const [cordis, tools] = await Promise.all([
        import(pathToFileURL(join(scope, REQUIRED.cordis)).href),
        import(pathToFileURL(join(scope, REQUIRED.tools)).href),
      ]);
      cached = { root: scope, cordis, tools };
      return cached;
    } catch (error) {
      failures.push(`${scope}: ${error?.message ?? error}`);
    }
  }
  throw new Error(
    'dsh-overleaf cannot locate the harness tool modules. '
    + `Tried:\n  ${failures.join('\n  ')}\n`
    + 'Set DSH_HOST_MODULES to the node_modules directory that contains @deepseek-ai.',
  );
}
