import path from 'path';
import { fileURLToPath } from 'url';
import * as fflate from 'fflate';
import { describe, expect, it } from 'vitest';
import { loadGasClass } from '../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadGasClass(path.join(__dirname, '../../src/Core/Utils/FileUtils.js'), { fflate });

describe('FileUtils.unzip', () => {
  it('returns UTF-8 text for every archive entry', () => {
    const archive = fflate.zipSync({
      'first.csv': fflate.strToU8('id,name\n1,Alice'),
      'nested/second.csv': fflate.strToU8('id,name\n2,Zoë'),
    });

    expect(globalThis.FileUtils.unzip(archive).map(file => file.getDataAsString())).toEqual([
      'id,name\n1,Alice',
      'id,name\n2,Zoë',
    ]);
  });
});
