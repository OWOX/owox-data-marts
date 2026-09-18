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
 * Packing here and installing the tarballs removes the registry from the
 * critical path entirely. It is also the same artifact either way: `npm
 * publish` uploads the tarball `npm pack` produces, so the image now installs
 * the exact bytes that get published rather than a copy fetched back.
 *
 * Only what `owox` actually pulls in at runtime is packed, so the image keeps
 * the contents it has today. `@owox/ctl`, `@owox/plugin-sdk` and
 * `@owox/api-client` are published but nothing in `owox` reaches them, and
 * packing them would add binaries the image never had.
 *
 * Usage: node tools/pack-owox-image-packages.mjs [output-dir]
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY_PACKAGE = 'owox';
const outputDir = path.resolve(ROOT, process.argv[2] ?? 'docker-packages');

/**
 * Reads every workspace manifest under the directories npm is configured to
 * treat as workspaces.
 *
 * @returns {Map<string, {dir: string, manifest: object}>} keyed by package name
 */
function readWorkspaces() {
  const workspaces = new Map();

  for (const group of ['apps', 'packages']) {
    const groupDir = path.join(ROOT, group);
    if (!fs.existsSync(groupDir)) continue;

    for (const entry of fs.readdirSync(groupDir)) {
      const dir = path.join(groupDir, entry);
      const manifestPath = path.join(dir, 'package.json');
      if (!fs.existsSync(manifestPath)) continue;

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      workspaces.set(manifest.name, { dir, manifest });
    }
  }

  return workspaces;
}

/**
 * The packages changesets releases together. Anything outside this list is
 * private -- `@owox/ui` for instance is a path dependency of `@owox/web` that
 * is never published -- and must not be packed.
 *
 * @returns {Set<string>} publishable package names
 */
function readPublishablePackages() {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, '.changeset/config.json'), 'utf8'));
  const [fixedGroup] = config.fixed ?? [];

  if (!fixedGroup?.length) {
    throw new Error(
      '.changeset/config.json declares no fixed group to derive publishable packages from'
    );
  }

  return new Set(fixedGroup);
}

/**
 * Walks runtime dependencies from `owox` and keeps the publishable ones, so
 * the set tracks the manifests instead of a list that silently goes stale.
 *
 * @param {Map<string, {manifest: object}>} workspaces every workspace manifest
 * @param {Set<string>} publishable names changesets releases
 * @returns {string[]} packages to pack, entry package included
 */
function resolveRuntimeClosure(workspaces, publishable) {
  const closure = new Set([ENTRY_PACKAGE]);
  const queue = [ENTRY_PACKAGE];

  while (queue.length > 0) {
    const current = queue.pop();
    const manifest = workspaces.get(current)?.manifest;
    if (!manifest) continue;

    const runtimeDeps = {
      ...(manifest.dependencies ?? {}),
      ...(manifest.optionalDependencies ?? {}),
    };

    for (const dependency of Object.keys(runtimeDeps)) {
      if (!publishable.has(dependency) || closure.has(dependency)) continue;
      closure.add(dependency);
      queue.push(dependency);
    }
  }

  return [...closure].sort();
}

const workspaces = readWorkspaces();
const publishable = readPublishablePackages();

if (!workspaces.has(ENTRY_PACKAGE)) {
  throw new Error(
    `Workspace "${ENTRY_PACKAGE}" not found -- cannot determine what the image installs`
  );
}

const toPack = resolveRuntimeClosure(workspaces, publishable);
const { version } = workspaces.get(ENTRY_PACKAGE).manifest;

// Stale tarballs from an earlier version would be copied into the image
// alongside the current ones, so the directory starts empty every time.
fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

console.log(
  `Packing ${toPack.length} packages at ${version} into ${path.relative(ROOT, outputDir)}/\n`
);

for (const name of toPack) {
  // `npm pack` runs each package's prepack hook, which is what builds its dist.
  execFileSync('npm', ['pack', '--workspace', name, '--pack-destination', outputDir], {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

const packed = fs.readdirSync(outputDir).filter(file => file.endsWith('.tgz'));

if (packed.length !== toPack.length) {
  throw new Error(
    `Expected ${toPack.length} tarballs, found ${packed.length}: ${packed.join(', ')}`
  );
}

/**
 * Maps each packed package name to the tarball that carries it.
 *
 * @returns {Map<string, string>} package name to tarball filename
 */
function mapTarballsToPackages() {
  const byName = new Map();

  for (const file of packed) {
    // `tar -xzO` writes the member to stdout; the manifest is always at package/package.json.
    const manifest = execFileSync(
      'tar',
      ['-xzOf', path.join(outputDir, file), 'package/package.json'],
      {
        encoding: 'utf8',
      }
    );
    byName.set(JSON.parse(manifest).name, file);
  }

  return byName;
}

const tarballs = mapTarballsToPackages();

// The image installs this as an ordinary project rather than eight global
// packages. A global install gives every argument its own tree, which stops npm
// deduplicating between them and cost ~240 MB of duplicated dependencies; one
// project root hoists the lot. The overrides point every internal dependency at
// a tarball, so no version of ours is ever looked up in the registry.
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

console.log(`\nPacked ${packed.length} tarballs:`);
for (const file of packed.sort()) {
  const { size } = fs.statSync(path.join(outputDir, file));
  console.log(`  ${file} (${(size / 1024 / 1024).toFixed(1)} MB)`);
}
console.log('\nWrote image-package.json pinning every internal dependency to its tarball.');
