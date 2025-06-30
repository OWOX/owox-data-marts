import { config } from '@owox/eslint-config/base';
import globals from 'globals';

export default [
  ...baseConfig,
  {
    ignores: ['.astro/**'],
  },
  {
    files: ['scripts/**/*.ts', 'scripts/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
];
