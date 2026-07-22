import { config as baseConfig } from '@owox/eslint-config/base';
import globals from 'globals';

export default [
  ...baseConfig,
  {
    ignores: ['.astro/**'],
  },
  {
    files: ['scripts/**/*.{js,mjs,ts}'],
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
