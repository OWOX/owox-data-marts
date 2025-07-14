import { config as baseConfig } from '@owox/eslint-config/node';

export default [
  ...baseConfig,
  {
    ignores: [
      // service dirs
      '.git/',
      '.github/',
      '.husky/',
      'node_modules/',
      'dist/',
      'build/',
      'coverage/',

      // workspaces
      'packages/*',
      'apps/*',
    ],
  },
];
