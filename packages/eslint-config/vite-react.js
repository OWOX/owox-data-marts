import eslintConfigPrettier from 'eslint-config-prettier';
import pluginReact from 'eslint-plugin-react';
import pluginReactRefresh from 'eslint-plugin-react-refresh';

import { reactRulesConfig } from './react-internal.js';
import { config as viteConfig, viteLanguageOptions } from './vite.js';

/**
 * A custom ESLint configuration for Vite applications that use React.
 *
 * @type {import("eslint").Linter.Config}
 */
export const config = [
  ...viteConfig,
  eslintConfigPrettier,
  pluginReact.configs.flat.recommended,
  {
    languageOptions: {
      ...pluginReact.configs.flat.recommended.languageOptions,
      ...viteLanguageOptions,
      // Merge parserOptions from both configs
      parserOptions: {
        ...pluginReact.configs.flat.recommended.languageOptions?.parserOptions,
        ...viteLanguageOptions.parserOptions,
      },
    },
  },
  {
    ...reactRulesConfig,
    plugins: {
      ...reactRulesConfig.plugins,
      'react-refresh': pluginReactRefresh,
    },
    rules: {
      ...reactRulesConfig.rules,
      // Vite Fast Refresh
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
];
