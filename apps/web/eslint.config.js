import tseslint from 'typescript-eslint';
import { config } from '@owox/eslint-config/vite-react';

export default tseslint.config(
  ...config,
  {
    ignores: ['src/features/data-marts/insights-prev/**'],
  },
  // Allow numbers in template literals (e.g. field array index paths like `items.${index}.name`)
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  // Disable TypeScript type-checking for config files in root
  {
    files: ['*.config.{js,mjs,ts}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  // E2E tests: disable type-checked rules and React hooks (Playwright `use` triggers false positives)
  {
    files: ['e2e/**/*.ts'],
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  }
);
