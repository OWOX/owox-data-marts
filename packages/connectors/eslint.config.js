import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  // Configuration for CommonJS files in src/
  {
    files: ['src/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      ecmaVersion: 2022,
      sourceType: 'commonjs',
    },
    rules: {
      ...js.configs.recommended.rules,
      // Allow unused variables starting with underscore
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^_',
          argsIgnorePattern: '^_',
        },
      ],
    },
  },
  // Configuration for ES modules at root level
  // Apply prettier config to all files
  eslintConfigPrettier,
  // Ignore patterns
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
];
