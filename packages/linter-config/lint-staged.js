/**
 * Lint-staged configuration for OWOX Data Marts monorepo
 *
 * This config runs different tools on different file types during pre-commit
 * to ensure code quality and consistent formatting across the workspace.
 *
 * ESLint validates first (without --fix), then Prettier formats only if validation passes
 */

/**
 * Base lint-staged configuration
 * @type {Record<string, string | string[]>}
 */
export const config = {
  // TypeScript files: ESLint validation then Prettier formatting
  '**/*.{ts,tsx}': ['eslint', 'prettier --write'],

  // JavaScript files: ESLint validation then Prettier formatting
  '**/*.{js,jsx,mjs,cjs}': ['eslint', 'prettier --write'],

  // JSON files: Prettier only
  '**/*.json': ['prettier --write'],

  // Markdown files: Prettier only
  '**/*.md': ['prettier --write'],

  // CSS/SCSS files: Prettier only
  '**/*.{css,scss}': ['prettier --write'],

  // YAML files: Prettier only
  '**/*.{yml,yaml}': ['prettier --write'],
};

/**
 * Configuration optimized for backend projects
 */
export const backendConfig = {
  '**/*.ts': ['eslint', 'prettier --write'],
  '**/*.{json,md}': ['prettier --write'],
};

/**
 * Configuration optimized for web projects
 */
export const webConfig = {
  '**/*.{ts,tsx}': ['eslint', 'prettier --write'],
  '**/*.{js,jsx}': ['eslint', 'prettier --write'],
  '**/*.{json,md,css,scss}': ['prettier --write'],
};

/**
 * Configuration for connectors (JavaScript-heavy)
 */
export const connectorsConfig = {
  '**/*.{js,mjs}': ['eslint', 'prettier --write'],
  '**/*.{json,md}': ['prettier --write'],
};
