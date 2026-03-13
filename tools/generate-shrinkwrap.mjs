import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const OWOX_DIR = path.join(ROOT_DIR, 'apps/owox');

/**
 * Generates npm-shrinkwrap.json for the owox CLI package.
 *
 * Approach:
 *   1. Build a standalone package.json (workspace deps → published versions)
 *   2. Seed a package-lock.json with pinned versions from monorepo lockfile
 *   3. Run `npm install --package-lock-only` — npm validates the tree,
 *      fixes hoisting/nesting, adds missing packages, but respects pins
 *
 * This gives us both correctness (npm's resolver) and determinism
 * (pinned versions from CI-tested monorepo lockfile).
 */
function main() {
  console.log('Generating npm-shrinkwrap.json for owox package...');

  const lockfile = loadLockfile();
  const owoxPkgJson = JSON.parse(fs.readFileSync(path.join(OWOX_DIR, 'package.json'), 'utf8'));
  const workspaceVersions = collectWorkspaceVersions(lockfile);
  const standalonePkg = buildStandalonePackageJson(owoxPkgJson, workspaceVersions);

  // Build seed lockfile from monorepo
  const seedLock = buildSeedLock(standalonePkg, lockfile, workspaceVersions);

  // Let npm validate and fix the tree
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'owox-shrinkwrap-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(standalonePkg, null, 2));
    fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), JSON.stringify(seedLock, null, 2));

    console.log('Running npm install --package-lock-only ...');
    runNpmInstallWithRetry(tmpDir);

    const result = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package-lock.json'), 'utf8'));

    // Report drift
    reportDrift(seedLock, result);

    const outputPath = path.join(OWOX_DIR, 'npm-shrinkwrap.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');

    const totalPackages = Object.keys(result.packages).length - 1;
    console.log(`Generated npm-shrinkwrap.json with ${totalPackages} packages`);
    console.log(`Output: ${outputPath}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Seed lockfile builder
// ---------------------------------------------------------------------------

/**
 * Build a seed package-lock.json from the monorepo lockfile.
 *
 * Extracts all npm (non-workspace, non-dev) packages reachable from owox's
 * dependency tree and maps them to top-level node_modules/ paths.
 * npm will then re-hoist/nest as needed.
 */
function buildSeedLock(standalonePkg, lockfile, workspaceVersions) {
  const seed = {
    name: standalonePkg.name,
    version: standalonePkg.version,
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name: standalonePkg.name,
        version: standalonePkg.version,
        dependencies: standalonePkg.dependencies,
        peerDependencies: standalonePkg.peerDependencies,
        engines: standalonePkg.engines,
      },
    },
  };

  // Collect all non-dev, non-link packages from monorepo lockfile
  // and remap workspace-nested paths to flat node_modules/ paths.
  //
  // We traverse from owox's deps, following production dependencies only.
  const visited = new Set();
  const queue = [];

  // Seed queue with owox's direct deps
  const allDeps = {
    ...standalonePkg.dependencies,
    ...standalonePkg.peerDependencies,
  };
  for (const depName of Object.keys(allDeps)) {
    queue.push({ depName, fromLockPath: 'apps/owox' });
  }

  while (queue.length > 0) {
    const { depName, fromLockPath } = queue.shift();
    const resolved = findInLockfile(lockfile, depName, fromLockPath);
    if (!resolved) continue;

    const { lockPath, entry } = resolved;

    if (entry.link) {
      // Workspace package — resolve to workspace entry, queue its deps
      const wsPath = entry.resolved;
      const wsEntry = lockfile.packages[wsPath];
      if (!wsEntry) continue;

      const visitKey = `ws:${wsPath}`;
      if (visited.has(visitKey)) continue;
      visited.add(visitKey);

      // Add workspace package to seed with its published version
      // Include dependencies so npm knows the tree structure
      const wsName = lockPath.replace(/^node_modules\//, '');
      const version = workspaceVersions.get(wsName) || wsEntry.version;
      if (version) {
        const seedEntry = { version };
        // Resolve workspace deps to concrete versions for the seed
        const wsDeps = wsEntry.dependencies || {};
        const resolvedDeps = {};
        for (const [dep, range] of Object.entries(wsDeps)) {
          if (range === '*' && workspaceVersions.has(dep)) {
            resolvedDeps[dep] = workspaceVersions.get(dep);
          } else {
            resolvedDeps[dep] = range;
          }
        }
        if (Object.keys(resolvedDeps).length > 0) {
          seedEntry.dependencies = resolvedDeps;
        }
        const wsPeers = wsEntry.peerDependencies || {};
        if (Object.keys(wsPeers).length > 0) {
          seedEntry.peerDependencies = { ...wsPeers };
          if (wsEntry.peerDependenciesMeta) {
            seedEntry.peerDependenciesMeta = { ...wsEntry.peerDependenciesMeta };
          }
        }
        seed.packages[`node_modules/${wsName}`] = seedEntry;
      }

      // Queue workspace production + peer deps
      for (const subDep of Object.keys(wsEntry.dependencies || {})) {
        queue.push({ depName: subDep, fromLockPath: wsPath });
      }
      for (const subDep of Object.keys(wsEntry.peerDependencies || {})) {
        const meta = wsEntry.peerDependenciesMeta?.[subDep];
        if (!meta?.optional) {
          queue.push({ depName: subDep, fromLockPath: wsPath });
        }
      }
    } else {
      // Regular npm package
      if (visited.has(lockPath)) continue;
      visited.add(lockPath);

      // Extract the package's node_modules path (may be deeply nested in monorepo)
      // For the seed, we put it at top-level — npm will re-nest if needed
      const swPath = `node_modules/${depName}`;

      // Only add if not already claimed (first occurrence wins, typically the hoisted one)
      if (!seed.packages[swPath]) {
        const cleanEntry = { ...entry };
        delete cleanEntry.dev;
        delete cleanEntry.devOptional;
        delete cleanEntry.inBundle;
        seed.packages[swPath] = cleanEntry;
      }

      // Queue this package's production + non-optional peer deps
      for (const subDep of Object.keys(entry.dependencies || {})) {
        queue.push({ depName: subDep, fromLockPath: lockPath });
      }
      for (const subDep of Object.keys(entry.peerDependencies || {})) {
        const meta = entry.peerDependenciesMeta?.[subDep];
        if (!meta?.optional) {
          queue.push({ depName: subDep, fromLockPath: lockPath });
        }
      }
    }
  }

  return seed;
}

// ---------------------------------------------------------------------------
// Drift reporting
// ---------------------------------------------------------------------------

function reportDrift(seedLock, result) {
  let pinned = 0;
  let drifted = 0;
  const driftedList = [];

  for (const [swPath, entry] of Object.entries(result.packages)) {
    if (!swPath || !entry.version) continue;

    // Find this package in the seed
    const name = swPath.split('node_modules/').pop();

    // Check if seed had any entry for this package name (at any path)
    let foundInSeed = false;
    for (const [seedPath, seedEntry] of Object.entries(seedLock.packages)) {
      if (!seedPath) continue;
      const seedName = seedPath.split('node_modules/').pop();
      if (seedName === name && seedEntry.version === entry.version) {
        foundInSeed = true;
        break;
      }
    }

    if (foundInSeed) {
      pinned++;
    } else {
      drifted++;
      driftedList.push(`  ${name}: ${entry.version}`);
    }
  }

  console.log(`Pinned: ${pinned}, Drifted: ${drifted}`);
  if (drifted > 0 && driftedList.length <= 20) {
    driftedList.forEach(l => console.log(l));
  } else if (drifted > 0) {
    driftedList.slice(0, 10).forEach(l => console.log(l));
    console.log(`  ... and ${drifted - 10} more`);
  }
}

// ---------------------------------------------------------------------------
// Lockfile resolution helpers (from monorepo lockfile)
// ---------------------------------------------------------------------------

function findInLockfile(lockfile, depName, fromPath) {
  const searchPaths = getSearchPaths(fromPath, depName);
  for (const p of searchPaths) {
    const entry = lockfile.packages[p];
    if (entry) return { lockPath: p, entry };
  }
  return null;
}

function getSearchPaths(fromPath, depName) {
  const paths = [];
  let current = fromPath;

  while (true) {
    const candidate = current ? `${current}/node_modules/${depName}` : `node_modules/${depName}`;
    paths.push(candidate);

    if (!current) break;

    const nmIdx = current.lastIndexOf('/node_modules/');
    if (nmIdx >= 0) {
      current = current.substring(0, nmIdx);
    } else if (current.startsWith('node_modules/')) {
      current = '';
    } else {
      current = '';
    }
  }

  return paths;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadLockfile() {
  const lockfilePath = path.join(ROOT_DIR, 'package-lock.json');
  if (!fs.existsSync(lockfilePath)) {
    console.error('package-lock.json not found at root. Run npm install first.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(lockfilePath, 'utf8'));
}

function collectWorkspaceVersions(lockfile) {
  const versions = new Map();
  for (const [key, val] of Object.entries(lockfile.packages)) {
    if (!key.startsWith('node_modules/') || !val.link || !val.resolved) continue;
    const pkgName = key.replace('node_modules/', '');
    const wsEntry = lockfile.packages[val.resolved];
    if (wsEntry?.version) versions.set(pkgName, wsEntry.version);
  }
  return versions;
}

function buildStandalonePackageJson(owoxPkgJson, workspaceVersions) {
  const rootPkgJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));

  const pkg = {
    name: owoxPkgJson.name,
    version: owoxPkgJson.version,
    type: owoxPkgJson.type,
  };
  if (owoxPkgJson.dependencies) {
    pkg.dependencies = resolveWorkspaceDeps(owoxPkgJson.dependencies, workspaceVersions);
  }
  if (owoxPkgJson.peerDependencies) {
    pkg.peerDependencies = { ...owoxPkgJson.peerDependencies };
  }
  if (owoxPkgJson.engines) {
    pkg.engines = { ...owoxPkgJson.engines };
  }
  if (rootPkgJson.overrides) {
    pkg.overrides = { ...rootPkgJson.overrides };
  }
  return pkg;
}

function resolveWorkspaceDeps(deps, workspaceVersions) {
  const resolved = {};
  for (const [name, range] of Object.entries(deps)) {
    if (range === '*' && workspaceVersions.has(name)) {
      resolved[name] = workspaceVersions.get(name);
    } else {
      resolved[name] = range;
    }
  }
  return resolved;
}

const NPM_RETRY_DELAY_MS = 15 * 1000;
const NPM_MAX_RETRIES = 12;

function runNpmInstallWithRetry(cwd) {
  for (let attempt = 1; attempt <= NPM_MAX_RETRIES; attempt++) {
    try {
      execSync('npm install --package-lock-only --ignore-scripts', {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 1000 * 60 * 10,
      });
      return;
    } catch (err) {
      const stderr = err.stderr?.toString() || '';
      if (!stderr.includes('ETARGET') || attempt === NPM_MAX_RETRIES) {
        throw err;
      }
      const match = stderr.match(/No matching version found for (.+?)\./);
      const pkg = match ? match[1] : 'unknown';
      console.log(`Waiting for ${pkg} to appear on npm (attempt ${attempt}/${NPM_MAX_RETRIES})...`);
      execSync(`sleep ${NPM_RETRY_DELAY_MS / 1000}`);
    }
  }
}

main();
