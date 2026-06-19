import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getOrCreateAnonymousId } from './anonymous-id.js';

describe('getOrCreateAnonymousId', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'owox-telemetry-'));
  });

  afterEach(() => {
    rmSync(dir, { force: true, recursive: true });
  });

  it('creates a UUID and a file on first run', () => {
    const result = getOrCreateAnonymousId(dir);
    expect(typeof result.anonymousId).toBe('string');
    expect(result.anonymousId!.length).toBeGreaterThan(0);
    expect(result.isFirstRun).toBe(true);
    expect(existsSync(join(dir, 'telemetry.json'))).toBe(true);
  });

  it('returns the same id and isFirstRun=false on subsequent runs', () => {
    const first = getOrCreateAnonymousId(dir);
    const second = getOrCreateAnonymousId(dir);
    expect(second.anonymousId).toBe(first.anonymousId);
    expect(second.isFirstRun).toBe(false);
  });

  it('returns a null id when the directory is unwritable', () => {
    const result = getOrCreateAnonymousId('/proc/owox-cannot-write-here');
    expect(result.anonymousId).toBe(null);
    expect(result.isFirstRun).toBe(false);
  });
});
