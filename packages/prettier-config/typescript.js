import { config as baseConfig } from './base.js';

/**
 * TypeScript-specific Prettier configuration
 * @type {import("prettier").Config}
 */
export const config = {
  ...baseConfig,

  // TypeScript specific overrides
  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      options: {
        parser: 'typescript',
      },
    },
    {
      files: ['*.json'],
      options: {
        parser: 'json',
        trailingComma: 'none',
      },
    }
  ],
};
