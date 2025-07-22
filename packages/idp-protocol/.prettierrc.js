import { config } from '@owox/prettier-config/base';

export default {
  ...config,
  // TypeScript-specific overrides
  overrides: [
    ...config.overrides,
    {
      files: ['*.ts', '*.tsx'],
      options: {
        parser: 'typescript',
      },
    },
  ],
};
