import { describe, expect, it, jest } from '@jest/globals';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { resolveResourcePath } from './template-paths.js';

const currentDir = dirname(fileURLToPath(import.meta.url));

describe('template-paths', () => {
  it('returns dist/resources path when exists', () => {
    const dir = join(currentDir, '..', 'resources');
    const expected = join(dir, 'file.txt');
    mkdirSync(dir, { recursive: true });
    writeFileSync(expected, 'tmp');

    const result = resolveResourcePath('file.txt');

    expect(result).toBe(expected);
    rmSync(expected);
  });

  it('falls back to src/resources when dist path missing', () => {
    const expected = join(currentDir, '..', '..', 'src', 'resources', 'file.txt');
    const distPath = join(currentDir, '..', 'resources', 'file.txt');
    if (existsSync(distPath)) {
      rmSync(distPath);
    }

    const result = resolveResourcePath('file.txt');

    expect(result).toBe(expected);
  });
});
