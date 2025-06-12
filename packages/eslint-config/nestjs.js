import globals from 'globals';

import { config as baseConfig } from './base.js';

/**
 * ESLint configuration for NestJS backend projects
 *
 * @type {import("eslint").Linter.Config}
 */
export const config = [
  ...baseConfig,
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      // NestJS specific rules
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-extraneous-class': [
        'error',
        { allowWithDecorator: true }, // Allow decorated classes (Controllers, Services, etc.)
      ],
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'error',

      // Dependency injection patterns
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],

      // Allow console for debugging (but warn)
      'no-console': 'error',
    },
  },
  // Config files should use ES modules
  {
    files: ['*.config.mjs', 'eslint.config.mjs', '*.config.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'off', // Allow console in config files
    },
  },
];
