#!/usr/bin/env node

/**
 * Setup script for OWOX Data Marts linter configuration
 *
 * This script automatically configures Husky git hooks
 * and sets up the necessary files for pre-commit validation.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { platform } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get the monorepo root (should be 1 level up from this script)
const repoRoot = join(__dirname, '..');

// Cross-platform detection
const isWindows = platform() === 'win32';

/**
 * Cross-platform function to make file executable
 * @param {string} filePath - Path to the file
 */
function makeExecutable(filePath) {
  try {
    if (isWindows) {
      // On Windows, files are executable by default for .bat/.cmd
      // Git hooks don't need chmod on Windows
      console.log(`ℹ️  Windows detected: skipping chmod for ${filePath}`);
    } else {
      // Unix-like systems (macOS, Linux)
      chmodSync(filePath, 0o755);
      console.log(`✅ Made ${filePath} executable`);
    }
  } catch (error) {
    console.log(`⚠️  Could not make ${filePath} executable: ${error.message}`);
  }
}

/**
 * Generate hook content
 * @param {string} command - Command to run in the hook
 * @returns {string} Hook content
 *
 * Git runs hooks through sh on every OS (including the sh.exe bundled with
 * Git for Windows), so a hook is always a POSIX shell script — never a Windows
 * batch file. Husky v9+ hooks contain only the command; the old
 * `#!/usr/bin/env sh` + `. "$(dirname -- "$0")/_/husky.sh"` boilerplate is
 * deprecated and is removed in husky v10.
 */
function generateHookContent(command) {
  return `${command}\n`;
}

/**
 * Create pre-commit hook
 */
function createPreCommitHook() {
  const huskyDir = join(repoRoot, '.husky');
  if (!existsSync(huskyDir)) {
    mkdirSync(huskyDir, { recursive: true });
  }

  const command = 'npm run pre-commit';
  const hookContent = generateHookContent(command);
  const hookPath = join(huskyDir, 'pre-commit');

  // Self-healing: only (re)write when the hook is missing or stale, so a hook
  // left over from an older setup (the broken Windows batch file or the
  // deprecated husky v9 boilerplate) is repaired on the next install.
  if (existsSync(hookPath) && readFileSync(hookPath, 'utf8') === hookContent) {
    console.log('ℹ️  Pre-commit hook is already up to date.');
    return false;
  }

  console.log('🪝 Writing pre-commit hook...');
  writeFileSync(hookPath, hookContent);
  makeExecutable(hookPath);

  console.log('✅ Pre-commit hook has been activated.');
  return true;
}

/**
 * Main setup function
 */
function main() {
  try {
    console.log('🚀 Setting up OWOX Data Marts husky configuration...');
    console.log(`📱 Platform: ${platform()}`);

    const changed = createPreCommitHook();

    // Hook already correct — nothing else to do, stay quiet on routine installs.
    if (!changed) {
      return;
    }

    console.log('');
    console.log('🎉 Setup completed successfully.');
    console.log('');
    console.log('📋 LINTING WORKFLOW:');
    console.log('  • ESLint: validation only (no auto-fix)');
    console.log('  • Commits: blocked on ESLint errors');
    console.log('  • Prettier: runs after successful ESLint validation');
    console.log('');
    console.log('Next steps:');
    console.log('1. Install root-level dependencies (if not already done).');
    console.log('2. Add these scripts to your workspace package.json:');
    console.log('   "lint": "eslint ."');
    console.log('   "lint:fix": "eslint . --fix"');
    console.log('   "format": "prettier --write ."');
    console.log('3. ✅ Workspace-specific .lintstagedrc.json files are configured.');
    console.log('');
    console.log('💡 Quick commands for blocked commits:');
    console.log('   npm run lint        # Check ESLint errors');
    console.log('   npm run lint:fix    # Auto-fix simple issues');
    console.log('   npm run format      # Format with Prettier');
    console.log('');
    console.log('Pre-commit hook is now active! 🚀');
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

main();
