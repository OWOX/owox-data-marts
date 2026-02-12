import { config } from '@owox/prettier-config/typescript';

export default {
  ...config,

  // Additional overrides for idp-owox-better-auth
  overrides: [
    ...config.overrides,
    {
      files: ['*.html'],
      options: {
        parser: 'html',
        printWidth: 120,
      },
    },
  ],
};
