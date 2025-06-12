/**
 * Lint-staged configuration for OWOX Data Marts
 *
 * This config runs different tools on different file types during pre-commit
 * to ensure code quality and consistent formatting across the workspace.
 *
 * ESLint validates first (without --fix), then Prettier formats only if validation passes
 */

/**
 * Creates ESLint command for specific workspace
 * @param {string} workspace - workspace path (e.g., 'apps/backend')
 * @param {string} configFile - eslint config file name
 * @returns {Function} lint-staged command function
 */
function createWorkspaceEslintCommand(workspace, configFile) {
  return filenames => {
    const workspaceRegex = new RegExp(`^.*/${workspace}/`);
    const relativePaths = filenames.map(f => f.replace(workspaceRegex, ''));
    return `bash -c "cd ${workspace} && npx eslint --config ${configFile} ${relativePaths.join(' ')}"`;
  };
}

/**
 * Workspace configurations map
 * Defines ESLint config for each workspace
 */
const workspaces = {
  'apps/backend': {
    patterns: '**/*.{ts,tsx}',
    eslintConfig: './eslint.config.mjs',
  },
  'apps/web': {
    patterns: '**/*.{ts,tsx,js,jsx}',
    eslintConfig: './eslint.config.js',
  },
  // 'packages/connector-runner': {
  //   patterns: '**/*.{js,mjs}',
  //   eslintConfig: './eslint.config.mjs',
  // },
  // 'packages/connectors': {
  //   patterns: '**/*.{js,mjs}',
  //   eslintConfig: './eslint.config.js',
  // },
  'packages/ui': {
    patterns: '**/*.{ts,tsx}',
    eslintConfig: './eslint.config.js',
  },
};

/**
 * Generate main configuration from workspaces map
 */
function generateConfig() {
  const mainConfig = {};

  // Add workspace-specific patterns
  Object.entries(workspaces).forEach(([workspace, { patterns, eslintConfig }]) => {
    const pattern = `${workspace}/${patterns}`;
    mainConfig[pattern] = [
      createWorkspaceEslintCommand(workspace, eslintConfig),
      'prettier --write',
    ];
  });

  // Add global prettier-only patterns
  const prettierOnlyPatterns = ['**/*.json', '**/*.md', '**/*.{css,scss}', '**/*.{yml,yaml}'];

  prettierOnlyPatterns.forEach(pattern => {
    mainConfig[pattern] = ['prettier --write'];
  });

  return mainConfig;
}

/**
 * Main workspace-aware configuration
 */
export const config = generateConfig();
