#!/usr/bin/env node

/**
 * Setup script for OWOX Data Marts linter configuration
 *
 * This script automatically configures Husky git hooks
 * and sets up the necessary files for pre-commit validation.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { platform } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get the monorepo root (should be 1 level up from this script)
const repoRoot = join(__dirname, '..');

// Note: no chmod is needed. Git runs hooks through `sh -e` via the husky
// wrapper (core.hooksPath=.husky/_), so the file's executable bit is never
// consulted on any OS.

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
 * Every pre-commit hook body this script has produced for a given command,
 * across all past formats. Self-healing overwrites the hook only when its
 * current content matches one of these — a hook a developer edited by hand is
 * never one of them, so it is preserved instead of silently clobbered.
 * @param {string} command - Command the hook runs
 * @returns {string[]} Recognized generated hook bodies
 */
function knownGeneratedHooks(command) {
  const firstLine = command.split('\n')[0].replace('# ', '');
  return [
    // Current husky v9+ format: just the command.
    `${command}\n`,
    // Legacy Unix husky v9 boilerplate that sourced husky.sh.
    `#!/usr/bin/env sh\n. "$(dirname -- "$0")/_/husky.sh"\n\n# ${firstLine}\n${command}\n`,
    // Legacy Windows batch style.
    `@echo off\n:: Husky hook for Windows\ncd /d "%~dp0"\ncall husky.cmd\n${command}\n`,
  ];
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
  const existing = existsSync(hookPath) ? readFileSync(hookPath, 'utf8') : null;

  // Already the current format — nothing to do.
  if (existing === hookContent) {
    console.log('ℹ️  Pre-commit hook is already up to date.');
    return false;
  }

  // Self-healing: (re)write only when the hook is missing or still in a format
  // this script generated before (the broken Windows batch file or the
  // deprecated husky v9 boilerplate). Anything else was customized by hand —
  // leave it untouched and let the developer decide.
  if (existing !== null && !knownGeneratedHooks(command).includes(existing)) {
    console.log('⚠️  .husky/pre-commit looks hand-edited — leaving it untouched.');
    console.log('    Delete it if you want this script to regenerate the managed hook.');
    return false;
  }

  console.log('🪝 Writing pre-commit hook...');
  writeFileSync(hookPath, hookContent);

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
