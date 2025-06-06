/**
 * Base Prettier configuration for OWOX Data Marts workspace
 * @type {import("prettier").Config}
 */
export const config = {
  // Core formatting
  semi: true,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'es5',
  printWidth: 100,

  // Line endings
  endOfLine: 'lf',

  // Object and array formatting
  bracketSpacing: true,
  bracketSameLine: false,

  // Arrow function parentheses
  arrowParens: 'avoid',

  // Prose wrap
  proseWrap: 'preserve',
};
