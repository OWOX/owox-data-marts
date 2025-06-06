import { config as typescriptConfig } from './typescript.js';

/**
 * Web/React-specific Prettier configuration with TailwindCSS support
 * @type {import("prettier").Config}
 */
export const config = {
  ...typescriptConfig,

  // Add TailwindCSS plugin for class sorting
  plugins: ['prettier-plugin-tailwindcss'],

  // Web-specific overrides
  overrides: [
    ...typescriptConfig.overrides,
    {
      files: ['*.tsx', '*.jsx'],
      options: {
        jsxSingleQuote: true,
        jsxBracketSameLine: false,
      },
    },
    {
      files: ['*.css', '*.scss'],
      options: {
        parser: 'css',
      },
    },
  ],
};
