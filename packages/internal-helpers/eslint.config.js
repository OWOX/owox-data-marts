import { config } from '@owox/eslint-config/node';

export default [
  ...config,
  {
    ignores: ['dist/**', 'dist-cjs/**', 'node_modules/**'],
  },
];
