import { config } from '@owox/eslint-config/node';

export default [
  ...config,
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '*.test.ts',
      '*.spec.ts',
      '*.config.js',
      '.prettierrc.js',
    ],
  },

  // TypeScript specific overrides for this package
  {
    files: ['**/*.ts'],
    rules: {
      // Allow unused vars in abstract methods
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
];
