import { jest } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { trackCommand } from './track-command.js';

describe('trackCommand', () => {
  let fetchMock: jest.Mock;
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'ctl-tele-'));
    fetchMock = jest.fn(async () => ({ ok: true }) as Response);
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    rmSync(dataDir, { force: true, recursive: true });
  });

  it('sends when enabled and configured', async () => {
    trackCommand({
      cliVersion: '0.26.0',
      command: 'status',
      dataDir,
      env: { POSTHOG_API_KEY: 'phc_test' },
    });
    await new Promise(r => setTimeout(r, 10));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not send when disabled', async () => {
    trackCommand({
      cliVersion: '0.26.0',
      command: 'status',
      dataDir,
      env: { OWOX_TELEMETRY_DISABLED: '1', POSTHOG_API_KEY: 'phc_test' },
    });
    await new Promise(r => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not send when no key configured', async () => {
    trackCommand({ cliVersion: '0.26.0', command: 'status', dataDir, env: {} });
    await new Promise(r => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never throws when fetch throws', () => {
    global.fetch = (() => {
      throw new Error('boom');
    }) as typeof fetch;
    expect(() =>
      trackCommand({
        cliVersion: '0.26.0',
        command: 'status',
        dataDir,
        env: { POSTHOG_API_KEY: 'phc_test' },
      })
    ).not.toThrow();
  });
});
