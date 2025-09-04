#!/usr/bin/env node

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');

/**
 * Reads the changeset configuration and extracts the list of packages
 * that are configured for synchronized versioning (fixed packages).
 *
 * @returns {Set<string>} A Set containing package names from the first fixed group,
 *                        or empty Set if no fixed configuration exists
 * @throws {Error} If .changeset/config.json file doesn't exist or contains invalid JSON
 * @throws {SyntaxError} If the config file contains malformed JSON
 */
function getPublishingPackages() {
  const configPath = join(ROOT_DIR, '.changeset', 'config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));

  return new Set(config.fixed?.[0] || []);
}

/**
 * Reads the main package.json file and discovers all workspace directories
 * by expanding workspace patterns and scanning for subdirectories.
 *
 * @returns {string[]} Array of absolute paths to all workspace directories
 * @throws {Error} If package.json file doesn't exist or contains invalid JSON
 * @throws {SyntaxError} If the package.json file contains malformed JSON
 * @throws {Error} If workspace directories cannot be read or accessed
 */
function getWorkspacesDirs() {
  const mainPackageJsonPath = join(ROOT_DIR, 'package.json');
  const mainPackageJson = JSON.parse(readFileSync(mainPackageJsonPath, 'utf8'));
  const workspaces = mainPackageJson.workspaces || [];

  const workspaceDirs = [];
  for (const workspace of workspaces) {
    const workspaceDir = workspace.replace('/*', '');
    const possiblePath = join(ROOT_DIR, workspaceDir);

    const entries = readdirSync(possiblePath);

    for (const entry of entries) {
      const entryPath = join(possiblePath, entry);
      if (statSync(entryPath).isDirectory()) {
        workspaceDirs.push(entryPath);
      }
    }
  }

  return workspaceDirs;
}

/**
 * Discovers and returns paths to package.json files for packages that are
 * configured in the changeset fixed configuration. Uses single-pass optimization
 * with early exit when all packages are found.
 *
 * @returns {string[]} Array of absolute paths to package.json files for fixed packages
 * @throws {Error} If not all expected packages are found in the workspace
 * @throws {Error} If package.json files contain invalid JSON
 * @throws {SyntaxError} If any package.json file contains malformed JSON
 */
function getPackagePaths() {
  const fixedPackagesSet = getPublishingPackages();
  if (fixedPackagesSet.size === 0) {
    return [];
  }

  const workspaceDirs = getWorkspacesDirs();

  const packagePaths = [];

  // Single pass through all workspaces
  for (const workspaceDir of workspaceDirs) {
    const packageJsonPath = join(workspaceDir, 'package.json');
    if (existsSync(packageJsonPath)) {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      if (fixedPackagesSet.has(pkg.name)) {
        packagePaths.push(packageJsonPath);
      }
    }

    // Early exit if we found all packages
    if (packagePaths.length === fixedPackagesSet.size) {
      break;
    }
  }

  // Error if not all packages found
  if (packagePaths.length < fixedPackagesSet.size) {
    throw new Error(
      `Expected ${fixedPackagesSet.size} packages, but found only ${packagePaths.length}`
    );
  }

  return packagePaths;
}

/**
 * Executes prettier on the specified package.json files. Automatically detects
 * if running in check mode (--check flag) or format mode (--write flag) based
 * on command line arguments.
 *
 * @param {string[]} packagePaths - Array of absolute paths to package.json files to format
 * @throws {Error} If prettier command execution fails
 * @throws {Error} If prettier binary is not found in node_modules/.bin
 * @throws {Error} In check mode, if any files are not properly formatted
 */
function runPrettier(packagePaths) {
  const prettierFlag = process.argv.includes('--check') ? '--check' : '--write';

  const command = `prettier ${prettierFlag} ${packagePaths.join(' ')}`;

  execSync(command, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${join(ROOT_DIR, 'node_modules', '.bin')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`,
    },
  });
}

/**
 * Main entry point for the prettier-packages script. Orchestrates the process
 * of discovering packages from changeset configuration and formatting their
 * package.json files using prettier.
 *
 * @throws {Error} If no package.json files are found to format
 * @throws {Error} If any step in the process fails (file reading, prettier execution, etc.)
 */
function main() {
  const packagePaths = getPackagePaths();

  if (packagePaths.length === 0) {
    throw new Error('No package.json files found to format. ');
  }

  runPrettier(packagePaths);
}

// Run the script
main();
