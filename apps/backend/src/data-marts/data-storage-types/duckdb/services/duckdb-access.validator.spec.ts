import { ConfigService } from '@nestjs/config';
import * as os from 'node:os';
import * as path from 'node:path';
import { DuckDbAccessValidator } from './duckdb-access.validator';
import { DataStorageType } from '../../enums/data-storage-type.enum';

// Plain `require` (rather than `import * as fs`) so `fs` refers to the real, mutable `fs`
// module object: ts-jest's `__importStar` wrapper for namespace imports produces a
// non-configurable getter-based proxy that `jest.spyOn` cannot redefine.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- see comment above
const fs: typeof import('node:fs') = require('node:fs');

const cfg = (dataDir: string) => ({ get: () => dataDir }) as unknown as ConfigService;

describe('DuckDbAccessValidator', () => {
  it('has type DUCKDB', () => {
    const v = new DuckDbAccessValidator(cfg('/tmp/unused'));
    expect(v.type).toBe(DataStorageType.DUCKDB);
  });

  it('rejects a non-object config', async () => {
    const v = new DuckDbAccessValidator(cfg('/tmp/unused'));

    const res = await v.validate(null as any, {} as any);

    expect(res.valid).toBe(false);
  });

  it('succeeds when the resolved data dir exists (or can be created) and is writable', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duckdb-access-validator-'));
    try {
      const v = new DuckDbAccessValidator(cfg(dir));

      const res = await v.validate({} as any, {} as any);

      expect(res.valid).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('creates the data dir when it does not exist yet', async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'duckdb-access-validator-'));
    const nested = path.join(parent, 'nested', 'data-dir');
    try {
      const v = new DuckDbAccessValidator(cfg(nested));

      const res = await v.validate({} as any, {} as any);

      expect(res.valid).toBe(true);
      expect(fs.existsSync(nested)).toBe(true);
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });

  it('fails when the resolved data dir is not writable', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duckdb-access-validator-'));
    const accessSpy = jest.spyOn(fs, 'accessSync').mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });
    try {
      const v = new DuckDbAccessValidator(cfg(dir));

      const res = await v.validate({} as any, {} as any);

      expect(res.valid).toBe(false);
      expect(res.errorMessage).toContain(dir);
    } finally {
      accessSpy.mockRestore();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
