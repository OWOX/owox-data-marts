import { includeIgnoreFile } from '@eslint/compat';
import oclif from 'eslint-config-oclif';
import prettier from 'eslint-config-prettier';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const gitignorePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.gitignore');

export default [
  includeIgnoreFile(gitignorePath),
  ...oclif,
  prettier,
  {
    files: ['*.config.*'],
    // rules: {
    //     'n/no-extraneous-import': 'off',
    // }
  },
  {
    // Disable import rules due to eslint-import-resolver-typescript incompatibility
    // with eslint-plugin-import v2.32.0 in flat config mode
    rules: {
      'import/namespace': 'off',
      'import/no-duplicates': 'off',
      'import/no-unresolved': 'off',
    },
  },
];
