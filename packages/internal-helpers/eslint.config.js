import { config } from '@owox/eslint-config/node';

export default [
  ...config,
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
];
