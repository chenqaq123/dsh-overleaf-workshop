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

import { existsSync, readFileSync, lstatSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const packageName = 'dsh-overleaf-workshop';
const legacyPackageNames = ['dsh-overleaf'];
const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Prefer the Desktop carrier: the ordinary CLI cannot manage the reserved desktop profile. */
function findDshCli(env = process.env, platform = process.platform) {
  const desktop = '/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh';
  const candidates = env.DSH_CLI ? [env.DSH_CLI] : [
    ...(platform === 'darwin' ? [desktop] : []),
    ...(env.PATH ?? '').split(delimiter).map(dir => join(dir, 'dsh')),
  ];
  const cli = candidates.find(path => existsSync(path)
    && (lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()));
  if (!cli) throw new Error('DSH CLI not found. Open Harness once, or set DSH_CLI to its executable path.');
  return cli;
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    env: { ...process.env, DSH_HOME: process.env.DSH_HOME ?? join(homedir(), '.dsh') },
    stdio: 'inherit',
    ...options,
  });
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
  const npm = process.env.NPM_CLI ?? 'npm';
  const result = spawnSync(npm, ['pack', source, '--pack-destination', destination, '--json'], {
    env: process.env,
    encoding: 'utf8',
  });
  if (result.error || result.status !== 0) {
    throw new Error(`npm pack failed${result.error ? `: ${result.error.message}` : ` (exit ${result.status})`}`);
  }
  let output;
  try { output = JSON.parse(result.stdout); } catch { throw new Error('npm pack returned unreadable JSON'); }
  const filename = output?.[0]?.filename;
  if (typeof filename !== 'string' || filename.includes('/') || filename.includes('\\')
    || !filename.startsWith(`${packageName}-`) || !filename.endsWith('.tgz')) {
    throw new Error(`npm pack returned an unexpected filename: ${String(filename)}`);
  }
  const tarball = join(destination, basename(filename));
  if (!existsSync(tarball)) throw new Error(`npm pack did not create ${tarball}`);
  return tarball;
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

function updateProfile(action, profile = 'desktop', { link = false } = {}) {
  if (!['install', 'uninstall'].includes(action)) {
    throw new Error('Usage: dsh-overleaf-workshop <install|uninstall> [profile] [--link]');
  }
  if (!/^[\w.-]+$/u.test(profile) || ['.', '..', 'node_modules'].includes(profile)) throw new Error('Invalid profile name');
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
