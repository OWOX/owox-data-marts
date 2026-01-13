import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import pluginReact from 'eslint-plugin-react';
import pluginReactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import { config as baseConfig } from './base.js';

/**
 * React-specific rules configuration that can be reused across different configs.
 */
export const reactRulesConfig = {
  plugins: {
    react: pluginReact,
    'react-hooks': pluginReactHooks,
  },
  settings: { react: { version: 'detect' } },
  rules: {
    ...pluginReactHooks.configs.recommended.rules,
    // React scope no longer necessary with new JSX transform.
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    // Disable rules that need refactoring
    'react/no-unknown-property': 'off',
    'react/no-unescaped-entities': 'off',
    'react/display-name': 'off',
    'react-hooks/set-state-in-effect': 'off',
    'react-hooks/purity': 'off',
    'react-hooks/refs': 'off',
    'react-hooks/use-memo': 'off',
    'react-hooks/immutability': 'off',
    'react-hooks/preserve-manual-memoization': 'off',
    'react-hooks/incompatible-library': 'off',
  },
};

/**
 * A custom ESLint configuration for libraries that use React.
 *
 * @type {import("eslint").Linter.Config} */
export const config = [
  ...baseConfig,
  js.configs.recommended,
  eslintConfigPrettier,
  ...tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  {
    languageOptions: {
      ...pluginReact.configs.flat.recommended.languageOptions,
      globals: {
        ...globals.serviceworker,
        ...globals.browser,
      },
    },
  },
  reactRulesConfig,
];
