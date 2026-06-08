import { jest } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TelemetryEvent } from '../integrations/event-bus/telemetry-event.js';
import { emitTelemetry } from './emit-telemetry.js';

class TestEvent extends TelemetryEvent<{ anonymousId: string; k: string }> {
  override get name(): string {
    return 'test.event';
  }
}

describe('emitTelemetry', () => {
  let fetchMock: jest.Mock;
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'emit-tele-'));
    fetchMock = jest.fn(async () => ({ ok: true }) as Response);
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    rmSync(dataDir, { force: true, recursive: true });
  });

  it('sends when enabled and configured', async () => {
    emitTelemetry({
      buildEvent: id => new TestEvent({ anonymousId: id, k: 'v' }),
      dataDir,
      env: { POSTHOG_API_KEY: 'phc_test' },
    });
    await new Promise(r => setTimeout(r, 10));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not send when disabled', async () => {
    emitTelemetry({
      buildEvent: id => new TestEvent({ anonymousId: id, k: 'v' }),
      dataDir,
      env: { OWOX_TELEMETRY_DISABLED: '1', POSTHOG_API_KEY: 'phc_test' },
    });
    await new Promise(r => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not send when no key configured', async () => {
    emitTelemetry({
      buildEvent: id => new TestEvent({ anonymousId: id, k: 'v' }),
      dataDir,
      env: {},
    });
    await new Promise(r => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows first-run notice once via log', () => {
    const log = jest.fn();
    emitTelemetry({
      buildEvent: id => new TestEvent({ anonymousId: id, k: 'v' }),
      dataDir,
      env: { POSTHOG_API_KEY: 'phc_test' },
      firstRunNotice: 'NOTICE',
      log,
    });
    expect(log).toHaveBeenCalledWith('NOTICE');
  });

  it('never throws when fetch throws', () => {
    global.fetch = (() => {
      throw new Error('boom');
    }) as typeof fetch;
    expect(() =>
      emitTelemetry({
        buildEvent: id => new TestEvent({ anonymousId: id, k: 'v' }),
        dataDir,
        env: { POSTHOG_API_KEY: 'phc_test' },
      })
    ).not.toThrow();
  });
});
