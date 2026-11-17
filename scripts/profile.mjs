#!/usr/bin/env node
/**
 * Register/unregister this plugin with the DSH native plugin manager.
 *
 * Installation is packaged by default: `npm pack` produces a tarball under
 * `<DSH_HOME>/plugin-packages`, and DSH installs that copy into its own profile.
 * The source checkout can then be moved or deleted. Pass `--link` for the
 * development workflow that symlinks this checkout instead.
 *
 * Usage: node scripts/profile.mjs <install|uninstall> [profile] [--link]
 */

import { existsSync, readFileSync, lstatSync, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const packageName = 'dsh-overleaf-workshop';
const legacyPackageNames = ['dsh-overleaf'];
const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WINDOWS = process.platform === 'win32';

/** Prefer the Desktop carrier: the ordinary CLI cannot manage the reserved desktop profile. */
function findDshCli(env = process.env, platform = process.platform) {
  const names = platform === 'win32' ? ['dsh.cmd', 'dsh.exe', 'dsh'] : ['dsh'];
  const desktop = platform === 'win32'
    ? join(env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Programs', 'DeepSeek Harness', 'resources', 'runtime', 'cli', 'bin', 'dsh.cmd')
    : '/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh';
  const candidates = env.DSH_CLI ? [env.DSH_CLI] : [
    ...(existsSync(desktop) ? [desktop] : []),
    ...(env.PATH ?? '').split(delimiter).filter(Boolean).flatMap(dir => names.map(name => join(dir, name))),
  ];
  const cli = candidates.find(path => existsSync(path)
    && (lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()));
  if (!cli) throw new Error('DSH CLI not found. Open Harness once, or set DSH_CLI to its executable path.');
  return cli;
}

/** Quote one argument for a `cmd.exe /c` command line. */
function quoteForCmd(value) {
  return /^[\w./:\\-]+$/u.test(value) ? value : `"${value.replaceAll('"', '')}"`;
}

/**
 * Run one helper process. Windows cannot spawn `.cmd`/`.bat` images directly
 * (Node raises EINVAL since the argv-injection fix), so every command goes
 * through `cmd.exe`, which also resolves bare names such as `npm` from the
 * PATH. The whole line is wrapped in one extra quote pair, exactly the way
 * Node's own `shell: true` builds it, so internal quoting survives `cmd /s`.
 */
function runProcess(command, args, options = {}) {
  if (!WINDOWS) return spawnSync(command, args, options);
  const line = [command, ...args].map(quoteForCmd).join(' ');
  return spawnSync('cmd.exe', ['/d', '/s', '/c', `"${line}"`], { ...options, windowsVerbatimArguments: true });
}

function run(command, args, options = {}) {
  return runProcess(command, args, {
    env: { ...process.env, DSH_HOME: process.env.DSH_HOME ?? join(homedir(), '.dsh') },
    stdio: 'inherit',
    ...options,
  });
}

/** Candidate launchers able to produce the installable tarball. */
function packRunners() {
  const runners = [];
  if (process.env.NPM_CLI) runners.push({ command: process.env.NPM_CLI });
  // A Node installed from the official distribution always carries npm beside itself.
  const npmCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (existsSync(npmCli)) runners.push({ command: process.execPath, args: [npmCli] });
  runners.push({ command: 'npm' });
  // The Desktop carrier ships pnpm; run it with its own bundled Node.
  const harnessDir = WINDOWS
    ? join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Programs', 'DeepSeek Harness')
    : undefined;
  if (harnessDir !== undefined) {
    const runtimeNode = join(harnessDir, 'resources', 'runtime', 'primary-runtime', 'dependencies', 'node', 'bin', 'node.exe');
    const pnpmCli = join(harnessDir, 'resources', 'runtime', 'primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.cjs');
    if (existsSync(runtimeNode) && existsSync(pnpmCli)) runners.push({ command: runtimeNode, args: [pnpmCli] });
  }
  return runners;
}

/** Whether the profile still loads this package through its source checkout. */
function installedAsLink(base, profile) {
  try {
    return lstatSync(join(base, 'profiles', profile, 'node_modules', packageName)).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Build a tarball DSH can install without retaining this checkout. */
function packPlugin(base) {
  const destination = join(base, 'plugin-packages');
  mkdirSync(destination, { recursive: true, mode: 0o755 });
  const metadata = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
  const tarball = join(destination, `${metadata.name}-${metadata.version}.tgz`);
  rmSync(tarball, { force: true });
  const failures = [];
  for (const runner of packRunners()) {
    const result = runProcess(runner.command, [...runner.args ?? [], 'pack', source, '--pack-destination', destination], {
      env: process.env,
      encoding: 'utf8',
    });
    if (!result.error && result.status === 0 && existsSync(tarball)) return tarball;
    failures.push(`${runner.command}${result.error ? `: ${result.error.message}` : ` (exit ${result.status})`}`);
  }
  throw new Error(`npm pack failed; tried: ${failures.join('; ')}`);
}

/** Whether a recorded legacy dependency was installed from this checkout. */
function isOwnLegacySpec(base, spec) {
  if (typeof spec !== 'string') return false;
  if (spec.startsWith('link:')) {
    try {
      return resolve(spec.slice('link:'.length)) === source;
    } catch {
      return false;
    }
  }
  if (spec.startsWith('file:')) {
    const tarball = resolve(spec.slice('file:'.length));
    const name = basename(tarball);
    return dirname(tarball) === join(base, 'plugin-packages')
      && name.startsWith('dsh-overleaf-') && name.endsWith('.tgz');
  }
  return false;
}

/**
 * Refuse profile mutations while the app is running. POSIX lets pnpm replace
 * files a live process holds open; Windows does not, and a partially written
 * `node_modules` breaks the whole profile at the next boot.
 */
function assertAppClosed() {
  if (!WINDOWS) return;
  const result = spawnSync('tasklist', ['/FI', 'IMAGENAME eq DeepSeek Harness.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8' });
  if ((result.stdout ?? '').includes('DeepSeek Harness.exe')) {
    throw new Error('DeepSeek Harness 正在运行。请完全退出应用（包括系统托盘图标）后，再安装或卸载插件。');
  }
}

function updateProfile(action, profile = 'desktop', { link = false } = {}) {
  if (!['install', 'uninstall'].includes(action)) {
    throw new Error('Usage: dsh-overleaf-workshop <install|uninstall> [profile] [--link]');
  }
  if (!/^[\w.-]+$/u.test(profile) || ['.', '..', 'node_modules'].includes(profile)) throw new Error('Invalid profile name');
  assertAppClosed();
  const base = resolve(process.env.DSH_HOME ?? join(homedir(), '.dsh'));
  const manifestPath = join(base, 'profiles', profile, 'package.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Profile does not exist: ${join(base, 'profiles', profile)}. Open Harness once before installing.`);
  }
  let spec;
  if (action === 'install') {
    const metadata = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
    if (metadata.name !== packageName) throw new Error(`Not a ${packageName} checkout`);
    spec = link ? `link:${source}` : `file:${packPlugin(base)}`;
  }
  const cli = findDshCli();
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  // The package was renamed from `dsh-overleaf` (already taken on npm). Remove
  // an older copy installed from this checkout so the profile does not mount
  // both plugins. A third-party `dsh-overleaf` dependency is left alone.
  if (action === 'install') {
    for (const legacy of legacyPackageNames) {
      if (!isOwnLegacySpec(base, manifest.dependencies?.[legacy])) continue;
      const removed = run(cli, ['plugin', '--profile', profile, 'remove', legacy]);
      if (removed.error || removed.status !== 0) {
        throw new Error(`DSH native remove failed for ${legacy}${removed.error ? `: ${removed.error.message}` : ` (exit ${removed.status})`}`);
      }
    }
  }
  const recorded = manifest.dependencies?.[packageName];
  const mustReplace = action === 'install' && recorded !== undefined
    // A packaged tarball can change without a version bump; pnpm would otherwise
    // keep the copy it already extracted. A link only needs replacing when the
    // spec changed or the profile still holds an older symlink.
    && (!link || installedAsLink(base, profile) || recorded !== spec);
  if (mustReplace) {
    const removed = run(cli, ['plugin', '--profile', profile, 'remove', packageName]);
    if (removed.error || removed.status !== 0) {
      throw new Error(`DSH native remove failed${removed.error ? `: ${removed.error.message}` : ` (exit ${removed.status})`}`);
    }
  }
  const args = ['plugin', '--profile', profile,
    ...(action === 'install' ? ['add', spec] : ['remove', packageName])];
  const result = run(cli, args);
  if (result.error || result.status !== 0) {
    throw new Error(`DSH native ${action} failed${result.error ? `: ${result.error.message}` : ` (exit ${result.status})`}`);
  }
  return spec;
}

if (process.argv[1] && existsSync(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const action = args[0] ?? 'install';
    const flags = args.filter(argument => argument.startsWith('-'));
    const unknown = flags.filter(flag => flag !== '--link');
    if (unknown.length > 0) throw new Error(`Unknown option${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`);
    const profile = args.slice(1).find(argument => !argument.startsWith('-'))
      ?? process.env.DSH_PROFILE ?? 'desktop';
    const link = flags.includes('--link');
    const spec = updateProfile(action, profile, { link });
    console.log(`${action === 'install' ? 'Installed through DSH' : 'Uninstalled'} ${packageName}`);
    if (action === 'install') {
      console.log(spec.startsWith('link:')
        ? `Development link: ${spec.slice('link:'.length)} (keep the checkout in place)`
        : `Packaged copy: ${spec.slice('file:'.length)} (the checkout may be moved or deleted)`);
    }
    console.log('Restart DeepSeek Harness. Manage the plugin from its Plugins page.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
