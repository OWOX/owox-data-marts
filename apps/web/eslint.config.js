import tseslint from 'typescript-eslint';
import { config } from '@owox/eslint-config/vite-react';

export default tseslint.config(
  ...config,
  // Disable TypeScript type-checking for config files in root
  {
    files: ['*.config.{js,mjs,ts}'],
    extends: [tseslint.configs.disableTypeChecked],
  }
);
