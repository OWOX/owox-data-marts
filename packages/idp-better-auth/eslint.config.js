import { config as baseConfig } from '@owox/eslint-config/base';

export default [
  ...baseConfig,
  {
    ignores: ['dist/**', 'node_modules/**', 'scripts/**/*.cjs'],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
