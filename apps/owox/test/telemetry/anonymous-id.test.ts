import { expect } from 'chai';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getOrCreateAnonymousId } from '../../src/telemetry/anonymous-id.js';

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
    expect(result.anonymousId).to.be.a('string').with.length.greaterThan(0);
    expect(result.isFirstRun).to.equal(true);
    expect(existsSync(join(dir, 'telemetry.json'))).to.equal(true);
  });

  it('returns the same id and isFirstRun=false on subsequent runs', () => {
    const first = getOrCreateAnonymousId(dir);
    const second = getOrCreateAnonymousId(dir);
    expect(second.anonymousId).to.equal(first.anonymousId);
    expect(second.isFirstRun).to.equal(false);
  });

  it('returns a null id when the directory is unwritable', () => {
    const result = getOrCreateAnonymousId('/proc/owox-cannot-write-here');
    expect(result.anonymousId).to.equal(null);
    expect(result.isFirstRun).to.equal(false);
  });
});
