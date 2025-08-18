import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DEPENDENCY_TYPES = ['dependencies', 'devDependencies'];

/**
 * Main function to update package versions during publishing.
 * Replaces wildcard (*) internal dependencies with concrete version numbers.
 */
function updatePackageVersions() {
  try {
    console.log('🚀 Start updating wildcard internal package versions for publishing');

    const packages = readAllPackages();

    const publishablePackages = Array.from(packages.values())
      .filter(pkg => pkg.isPublishable)
      .map(pkg => pkg.packageJson.name);

    if (publishablePackages.length === 0) {
      throw new Error('There are no publishable packages found! Please check changeset config');
    }
    console.log('📦 Publishable packages:', publishablePackages);

    const packageVersions = new Map();
    packages.forEach((pkg, name) => {
      if (pkg.isPublishable) {
        packageVersions.set(name, pkg.version);
      }
    });

    processingPackages(packages, packageVersions);

    console.log('✅ Package version update completed successfully');
  } catch (error) {
    console.error('❌ Error updating package versions:', error);
    process.exit(1);
  }
}

/**
 * Processes all packages and updates their internal dependencies.
 * @param {Map<string, object>} packages - Map of package name to package data
 * @param {Map<string, string>} packageVersions - Map of package name to version
 */
function processingPackages(packages, packageVersions) {
  for (const [packageName, packageData] of packages) {
    // Skip if this package is not publishable
    if (!packageData.isPublishable) {
      continue;
    }

    let updated = false;

    // Update all dependency types
    for (const depType of DEPENDENCY_TYPES) {
      updated |= updateDependencies(packageData.packageJson, packageVersions, depType);
    }

    // Write back if updated
    if (updated) {
      fs.writeFileSync(
        packageData.filePath,
        JSON.stringify(packageData.packageJson, null, 2) + '\n'
      );
      console.log(`💾 Updated package.json for ${packageName}`);
    }
  }
}

/**
 * Reads all packages from workspace directories and determines which are publishable.
 * @returns {Map<string, object>} Map of package name to package data
 */
function readAllPackages() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

  const workspaceDirs = getWorkspaceDirs(rootDir);
  const publishablePackages = getPublishablePackages(rootDir);
  const packages = new Map();

  for (const workspaceDir of workspaceDirs) {
    const packageJsonPath = path.join(workspaceDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      packages.set(packageJson.name, {
        version: packageJson.version,
        packageJson,
        filePath: packageJsonPath,
        isPublishable: publishablePackages.has(packageJson.name),
      });
    }
  }

  return packages;
}

/**
 * Gets all workspace directories from the root package.json.
 * @param {string} rootDir - Root directory of the monorepo
 * @returns {string[]} Array of workspace directory paths
 */
function getWorkspaceDirs(rootDir) {
  const rootPackageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

  const workspaceDirs = [];
  for (const workspace of rootPackageJson.workspaces) {
    const normalizedWorkspace = workspace.replace(/\\/g, '/');
    const glob = path.join(rootDir, workspace);

    if (normalizedWorkspace.endsWith('/*')) {
      const baseDir = path.join(rootDir, workspace.replace('/*', ''));
      if (fs.existsSync(baseDir)) {
        const subdirs = fs.readdirSync(baseDir, { withFileTypes: true });
        subdirs.forEach(dirent => {
          if (dirent.isDirectory()) {
            workspaceDirs.push(path.join(baseDir, dirent.name));
          }
        });
      }
    } else {
      if (fs.existsSync(glob)) {
        workspaceDirs.push(glob);
      }
    }
  }

  return workspaceDirs;
}

/**
 * Gets publishable packages from changeset configuration.
 * @param {string} rootDir - Root directory of the monorepo
 * @returns {Set<string>} Set of publishable package names
 */
function getPublishablePackages(rootDir) {
  const changesetConfig = JSON.parse(
    fs.readFileSync(path.join(rootDir, '.changeset', 'config.json'), 'utf8')
  );

  const publishablePackages = new Set();
  if (changesetConfig.fixed) {
    changesetConfig.fixed.forEach(group => {
      group.forEach(pkg => publishablePackages.add(pkg));
    });
  }

  return publishablePackages;
}

/**
 * Updates dependencies of a specific type (dependencies/devDependencies) in package.json.
 * Replaces wildcard (*) versions with concrete version numbers for internal packages.
 * @param {object} packageJson - Package.json object to update
 * @param {Map<string, string>} packageVersions - Map of package name to version
 * @param {string} depType - Type of dependencies ('dependencies' or 'devDependencies')
 * @returns {boolean} True if any dependencies were updated
 */
function updateDependencies(packageJson, packageVersions, depType) {
  const dependencies = packageJson[depType];
  let updated = false;

  if (dependencies) {
    for (const [depName, depVersion] of Object.entries(dependencies)) {
      const targetVersion = packageVersions.get(depName);
      if (depVersion === '*' && targetVersion) {
        dependencies[depName] = targetVersion;
        updated = true;
        console.log(
          `🔄 Updated ${packageJson.name} ${depType}: ${depName} from "*" to ${targetVersion}`
        );
      }
    }
  }

  return updated;
}

// Run the script
updatePackageVersions();
