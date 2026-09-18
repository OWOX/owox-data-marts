#!/usr/bin/env node

/**
 * Packs the workspaces the container image installs into tarballs.
 *
 * The image used to run `npm install -g owox@<version>`, which meant a build
 * could only start once npm was serving every package of that version. For
 * `@owox/backend` that took between eight and sixteen minutes after a
 * successful publish -- its packument carries well over a thousand snapshot
 * versions -- so the build kept failing with `ETARGET No matching version
 * found` while the registry caught up.
 *
 * Packing here removes the registry from the critical path. On the release
 * path it is also the same artifact by construction, since `npm publish`
 * uploads what `npm pack` produces -- though nothing verifies that, and on the
 * snapshot path there is no published artifact to be the same as.
 *
 * Only what `owox` pulls in at runtime is packed, so the image keeps the
 * contents it has today. `@owox/ctl`, `@owox/plugin-sdk` and `@owox/api-client`
 * are published but nothing in `owox` reaches them, and packing them would add
 * binaries the image never had.
 *
 * This script does NOT build anything. Five of the eight packed workspaces have
 * no `prepack` that produces their `dist` -- they rely on the build step that
 * runs before this one -- so it asserts the output exists rather than trusting
 * the caller. Run `npm run build --workspace owox` first.
 *
 * Usage: node tools/pack-owox-image-packages.mjs [output-dir]
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY_PACKAGE = 'owox';
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const outputDir = path.resolve(ROOT, process.argv[2] ?? 'docker-packages');

/**
 * Reads a manifest, naming the file when it cannot be parsed -- a bare
 * SyntaxError from somewhere under apps/ or packages/ says nothing useful.
 *
 * @param {string} manifestPath absolute path to a package.json
 * @returns {object} the parsed manifest
 */
function readManifest(manifestPath) {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot parse ${path.relative(ROOT, manifestPath)}: ${error.message}`);
  }
}

/**
 * Reads every workspace manifest, taking the directories from the root
 * manifest rather than assuming them -- a new workspace group would otherwise
 * be skipped silently, and with it everything downstream in the graph.
 *
 * @returns {Map<string, {dir: string, manifest: object}>} keyed by package name
 */
function readWorkspaces() {
  const workspaces = new Map();
  const { workspaces: patterns } = readManifest(path.join(ROOT, 'package.json'));

  for (const pattern of patterns ?? []) {
    if (!pattern.endsWith('/*')) {
      throw new Error(`Unsupported workspace pattern "${pattern}" -- only "<dir>/*" is handled`);
    }

    const groupDir = path.join(ROOT, pattern.slice(0, -2));
    if (!fs.existsSync(groupDir)) continue;

    for (const entry of fs.readdirSync(groupDir)) {
      const dir = path.join(groupDir, entry);
      const manifestPath = path.join(dir, 'package.json');
      if (!fs.existsSync(manifestPath)) continue;

      const manifest = readManifest(manifestPath);
      if (!manifest.name) {
        throw new Error(`${path.relative(ROOT, manifestPath)} has no name`);
      }
      if (workspaces.has(manifest.name)) {
        throw new Error(`Two workspaces are both named ${manifest.name}`);
      }

      workspaces.set(manifest.name, { dir, manifest });
    }
  }

  return workspaces;
}

/**
 * Every dependency field npm will try to satisfy at install time. Peers matter
 * here: npm installs them, so an internal package reachable only as a peer
 * would be fetched from the registry -- the failure this script exists to
 * prevent.
 *
 * @param {object} manifest a package manifest
 * @returns {string[]} dependency names
 */
function installTimeDependencies(manifest) {
  return Object.keys({
    ...(manifest.dependencies ?? {}),
    ...(manifest.optionalDependencies ?? {}),
    ...(manifest.peerDependencies ?? {}),
  });
}

/**
 * The same test npm and changesets apply. A changeset `fixed` group would be
 * the wrong source: it declares version linkage, not publishability, and
 * `tools/update-package-versions-for-publishing.mjs` reads it differently.
 *
 * @param {Map<string, {manifest: object}>} workspaces every workspace manifest
 * @param {string} name package name to test
 * @returns {boolean} whether changesets would publish it
 */
function isPublishable(workspaces, name) {
  return workspaces.get(name)?.manifest.private !== true && workspaces.has(name);
}

/**
 * Walks install-time dependencies from `owox` and keeps the publishable ones,
 * so the set tracks the manifests instead of a list that goes stale.
 *
 * @param {Map<string, {manifest: object}>} workspaces every workspace manifest
 * @returns {string[]} packages to pack, entry package included
 */
function resolveRuntimeClosure(workspaces) {
  const closure = new Set([ENTRY_PACKAGE]);
  const queue = [ENTRY_PACKAGE];

  while (queue.length > 0) {
    const current = queue.pop();
    const entry = workspaces.get(current);

    // Failing open here would drop the whole subtree below this package and
    // leave the count check none the wiser.
    if (!entry) {
      throw new Error(`${current} is in the pack set but is not a workspace`);
    }

    for (const dependency of installTimeDependencies(entry.manifest)) {
      if (!isPublishable(workspaces, dependency) || closure.has(dependency)) continue;
      closure.add(dependency);
      queue.push(dependency);
    }
  }

  return [...closure].sort();
}

// `force: true` means a bad path is deleted without a word, and the argument
// exists precisely so a human can type it. `.` resolves to the repository root.
const relativeOutput = path.relative(ROOT, outputDir);
if (!relativeOutput || relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput)) {
  throw new Error(
    `Output directory must be inside ${ROOT}; got ${outputDir}. Refusing to delete it.`
  );
}

const workspaces = readWorkspaces();

if (!workspaces.has(ENTRY_PACKAGE)) {
  throw new Error(
    `Workspace "${ENTRY_PACKAGE}" not found -- cannot determine what the image installs`
  );
}

const toPack = resolveRuntimeClosure(workspaces);
const packSet = new Set(toPack);
const { version } = workspaces.get(ENTRY_PACKAGE).manifest;

// Anything publishable that the image needs but we do not pack gets resolved
// from the registry, where a snapshot version has never been published.
for (const name of toPack) {
  const { manifest } = workspaces.get(name);
  for (const dependency of installTimeDependencies(manifest)) {
    if (isPublishable(workspaces, dependency) && !packSet.has(dependency)) {
      throw new Error(
        `${name} depends on ${dependency}, which is publishable but is not being packed`
      );
    }
  }
}

// A packed tarball is only as good as the dist it carries, and most of these
// workspaces are built by the step before this one rather than by their own
// prepack. `npm pack` on a missing dist warns and exits 0, which would ship an
// image with no UI.
for (const name of toPack) {
  const { dir, manifest } = workspaces.get(name);
  const needsDist = (manifest.files ?? []).some(entry =>
    entry.replace(/^\.\//, '').startsWith('dist')
  );

  if (needsDist && !fs.existsSync(path.join(dir, 'dist'))) {
    throw new Error(
      `${name} has no dist/ -- build the workspaces before packing (npm run build --workspace owox)`
    );
  }
}

// Stale tarballs from an earlier version would be copied into the image
// alongside the current ones, so the directory starts empty every time.
fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

console.log(`Packing ${toPack.length} packages at ${version} into ${relativeOutput}/\n`);

const tarballs = new Map();

for (const name of toPack) {
  const { manifest } = workspaces.get(name);

  // Versions move together through the changeset fixed group, but the image is
  // tagged with one of them, so a drift would ship contents the tag denies.
  if (manifest.version !== version) {
    throw new Error(`${name} is at ${manifest.version} but the image will be tagged ${version}`);
  }

  execFileSync(NPM, ['pack', '--workspace', name, '--pack-destination', outputDir], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  // npm derives the filename from the name and version, so there is no need to
  // read it back out of the archive -- but it does need to be there.
  const file = `${name.replace('@', '').replace('/', '-')}-${manifest.version}.tgz`;
  if (!fs.existsSync(path.join(outputDir, file))) {
    throw new Error(`npm pack produced no ${file} for ${name}`);
  }

  tarballs.set(name, file);
}

// The image installs this as an ordinary project. Installing the tarballs
// globally instead gives each one its own tree, which stops npm deduplicating
// between them and cost ~240 MB when it was tried; one project root hoists the
// lot, matching what `npm install -g owox@<version>` produced before. The
// overrides point every internal dependency at a tarball, so no version of ours
// is ever looked up in the registry.
const imageManifest = {
  name: 'owox-image',
  private: true,
  dependencies: { [ENTRY_PACKAGE]: `file:./packages/${tarballs.get(ENTRY_PACKAGE)}` },
  overrides: Object.fromEntries(
    [...tarballs]
      .filter(([name]) => name !== ENTRY_PACKAGE)
      .map(([name, file]) => [name, `file:./packages/${file}`])
  ),
};

fs.writeFileSync(
  path.join(outputDir, 'image-package.json'),
  `${JSON.stringify(imageManifest, null, 2)}\n`
);

console.log(`\nPacked ${tarballs.size} tarballs:`);
for (const file of [...tarballs.values()].sort()) {
  const { size } = fs.statSync(path.join(outputDir, file));
  console.log(`  ${file} (${(size / 1024 / 1024).toFixed(1)} MB)`);
}
console.log('\nWrote image-package.json pinning every internal dependency to its tarball.');
