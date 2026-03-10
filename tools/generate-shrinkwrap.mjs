import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const OWOX_DIR = path.join(ROOT_DIR, 'apps/owox');

/**
 * Generates npm-shrinkwrap.json for the owox package by extracting
 * its complete dependency tree from the root package-lock.json.
 *
 * This ensures deterministic dependency resolution when users install
 * the CLI globally via `npm install -g owox`.
 */
function main() {
  console.log('Generating npm-shrinkwrap.json for owox package...');

  const lockfilePath = path.join(ROOT_DIR, 'package-lock.json');
  if (!fs.existsSync(lockfilePath)) {
    console.error('package-lock.json not found at root. Run npm install first.');
    process.exit(1);
  }

  const lockfile = JSON.parse(fs.readFileSync(lockfilePath, 'utf8'));
  const owoxPkgJson = JSON.parse(fs.readFileSync(path.join(OWOX_DIR, 'package.json'), 'utf8'));

  // Load publishable packages from changeset config
  const changesetConfig = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, '.changeset', 'config.json'), 'utf8')
  );
  const publishablePackages = new Set();
  if (changesetConfig.fixed) {
    changesetConfig.fixed.forEach(group => group.forEach(pkg => publishablePackages.add(pkg)));
  }

  // Build workspace path -> npm name mapping from lockfile link entries
  const wsPathToName = new Map();
  for (const [key, val] of Object.entries(lockfile.packages)) {
    if (key.startsWith('node_modules/') && val.link && val.resolved) {
      wsPathToName.set(val.resolved, key.replace('node_modules/', ''));
    }
  }

  // Initialize shrinkwrap
  const shrinkwrapRoot = {
    name: owoxPkgJson.name,
    version: owoxPkgJson.version,
    dependencies: { ...owoxPkgJson.dependencies },
  };
  if (owoxPkgJson.peerDependencies) {
    shrinkwrapRoot.peerDependencies = { ...owoxPkgJson.peerDependencies };
  }
  if (owoxPkgJson.engines) {
    shrinkwrapRoot.engines = { ...owoxPkgJson.engines };
  }
  if (owoxPkgJson.bin) {
    shrinkwrapRoot.bin = { ...owoxPkgJson.bin };
  }

  const shrinkwrap = {
    name: owoxPkgJson.name,
    version: owoxPkgJson.version,
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': shrinkwrapRoot,
    },
  };

  // Track claimed shrinkwrap paths to handle version conflicts
  // swPath -> { version, lockPath }
  const claimedPaths = new Map();
  // Track processed lockfile paths to avoid cycles
  const processedLockPaths = new Set();

  // BFS queue: { depName, fromLockPath, parentSwPath }
  const queue = [];

  // Seed with owox's production dependencies and peer dependencies
  const startDeps = {
    ...owoxPkgJson.dependencies,
    ...owoxPkgJson.peerDependencies,
  };
  for (const depName of Object.keys(startDeps)) {
    queue.push({ depName, fromLockPath: 'apps/owox', parentSwPath: '' });
  }

  while (queue.length > 0) {
    const { depName, fromLockPath, parentSwPath } = queue.shift();

    // Resolve dependency in the lockfile
    const resolved = findInLockfile(lockfile, depName, fromLockPath);
    if (!resolved) {
      console.warn(`Could not resolve "${depName}" from "${fromLockPath}" — skipping`);
      continue;
    }

    const { lockPath, entry } = resolved;

    if (entry.link) {
      // Workspace link — resolve to actual workspace entry
      const wsPath = entry.resolved;
      const wsEntry = lockfile.packages[wsPath];
      if (!wsEntry) {
        console.warn(`Workspace "${wsPath}" not found in lockfile — skipping`);
        continue;
      }

      const wsName = wsPathToName.get(wsPath) || depName;

      // Skip non-publishable workspace packages (e.g., @owox/ui)
      // Their code is bundled into the packages that depend on them
      if (!publishablePackages.has(wsName)) {
        console.log(`Skipping non-publishable workspace "${wsName}" — bundled at build time`);
        continue;
      }

      // Compute shrinkwrap path
      const swPath = claimSwPath(depName, wsEntry.version, lockPath, parentSwPath, claimedPaths);
      if (!swPath) continue; // already claimed with same version

      if (processedLockPaths.has(wsPath)) continue;
      processedLockPaths.add(wsPath);

      // Add workspace package entry (without resolved/integrity — will be fetched from npm)
      const wsSwEntry = { version: wsEntry.version };
      if (wsEntry.dependencies) wsSwEntry.dependencies = { ...wsEntry.dependencies };
      if (wsEntry.peerDependencies) wsSwEntry.peerDependencies = { ...wsEntry.peerDependencies };
      if (wsEntry.engines) wsSwEntry.engines = { ...wsEntry.engines };
      if (wsEntry.bin) wsSwEntry.bin = { ...wsEntry.bin };

      shrinkwrap.packages[swPath] = wsSwEntry;

      // Queue workspace's production deps
      const wsDeps = { ...wsEntry.dependencies };
      for (const subDep of Object.keys(wsDeps)) {
        queue.push({ depName: subDep, fromLockPath: wsPath, parentSwPath: swPath });
      }
      // Queue workspace's peer deps
      if (wsEntry.peerDependencies) {
        for (const subDep of Object.keys(wsEntry.peerDependencies)) {
          queue.push({ depName: subDep, fromLockPath: wsPath, parentSwPath: swPath });
        }
      }
    } else {
      // Regular npm package
      const swPath = claimSwPath(depName, entry.version, lockPath, parentSwPath, claimedPaths);
      if (!swPath) continue;

      if (processedLockPaths.has(lockPath)) continue;
      processedLockPaths.add(lockPath);

      // Copy entry, cleaning up monorepo-specific fields
      const cleanEntry = { ...entry };
      delete cleanEntry.dev;
      delete cleanEntry.devOptional;
      // Remove inBundle as it's monorepo-specific
      delete cleanEntry.inBundle;

      shrinkwrap.packages[swPath] = cleanEntry;

      // Queue this package's production dependencies
      if (entry.dependencies) {
        for (const subDep of Object.keys(entry.dependencies)) {
          queue.push({ depName: subDep, fromLockPath: lockPath, parentSwPath: swPath });
        }
      }
      // Queue peer dependencies (npm v7+ auto-installs peers)
      if (entry.peerDependencies) {
        for (const subDep of Object.keys(entry.peerDependencies)) {
          // Skip optional peer deps that might not be present
          const meta = entry.peerDependenciesMeta?.[subDep];
          if (meta?.optional) continue;
          queue.push({ depName: subDep, fromLockPath: lockPath, parentSwPath: swPath });
        }
      }
    }
  }

  // Write shrinkwrap
  const outputPath = path.join(OWOX_DIR, 'npm-shrinkwrap.json');
  fs.writeFileSync(outputPath, JSON.stringify(shrinkwrap, null, 2) + '\n');

  const totalPackages = Object.keys(shrinkwrap.packages).length - 1; // minus root
  console.log(`Generated npm-shrinkwrap.json with ${totalPackages} packages`);
  console.log(`Output: ${outputPath}`);
}

/**
 * Find a dependency in the lockfile by walking up from the given context path.
 * Mimics Node.js module resolution: checks nearest node_modules first, then parent.
 */
function findInLockfile(lockfile, depName, fromPath) {
  const searchPaths = getSearchPaths(fromPath, depName);

  for (const p of searchPaths) {
    const entry = lockfile.packages[p];
    if (entry) {
      return { lockPath: p, entry };
    }
  }

  return null;
}

/**
 * Generate lockfile search paths for a dependency, walking up from the context path.
 * E.g., from "apps/owox" looking for "@oclif/core":
 *   - "apps/owox/node_modules/@oclif/core"
 *   - "node_modules/@oclif/core"
 */
function getSearchPaths(fromPath, depName) {
  const paths = [];
  let current = fromPath;

  while (true) {
    const candidate = current ? `${current}/node_modules/${depName}` : `node_modules/${depName}`;
    paths.push(candidate);

    if (!current) break;

    // Walk up to parent
    const nmIdx = current.lastIndexOf('/node_modules/');
    if (nmIdx >= 0) {
      // Inside nested node_modules — go up one level
      current = current.substring(0, nmIdx);
    } else if (current.startsWith('node_modules/')) {
      // At top-level node_modules entry — go to root
      current = '';
    } else {
      // Workspace path (e.g., "apps/owox") — go to root
      current = '';
    }
  }

  return paths;
}

/**
 * Claim a shrinkwrap path for a package, handling version conflicts via nesting.
 * Returns the assigned shrinkwrap path, or null if already processed with same version.
 */
function claimSwPath(depName, version, lockPath, parentSwPath, claimedPaths) {
  // Try hoisted path first
  const hoistedPath = `node_modules/${depName}`;
  const existing = claimedPaths.get(hoistedPath);

  if (!existing) {
    // Hoisted spot is free
    claimedPaths.set(hoistedPath, { version, lockPath });
    return hoistedPath;
  }

  if (existing.version === version) {
    // Same version already hoisted — reuse (no duplicate entry needed)
    return null;
  }

  // Version conflict — nest under parent
  const nestedPath = parentSwPath
    ? `${parentSwPath}/node_modules/${depName}`
    : `node_modules/${depName}`;

  const existingNested = claimedPaths.get(nestedPath);
  if (existingNested) {
    if (existingNested.version === version) return null;
    // Deep nesting conflict — very rare, just warn
    console.warn(
      `Deep nesting conflict for "${depName}" at "${nestedPath}" ` +
        `(existing: ${existingNested.version}, new: ${version})`
    );
    return null;
  }

  claimedPaths.set(nestedPath, { version, lockPath });
  return nestedPath;
}

main();
