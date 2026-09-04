import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadGasClass } from '../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadGasClass(path.join(__dirname, '../../src/Core/Utils/AsyncUtils.js'));

// setTimeout coerces any delay past this to 1ms, so a backoff above it would run
// immediately instead of waiting — the failure mode the cap exists to prevent.
const SET_TIMEOUT_CEILING_MS = 2 ** 31 - 1;

describe('backoffDelay', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('doubles with each attempt', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    expect(globalThis.AsyncUtils.backoffDelay(1000, 1)).toBe(1000);
    expect(globalThis.AsyncUtils.backoffDelay(1000, 2)).toBe(2000);
    expect(globalThis.AsyncUtils.backoffDelay(1000, 3)).toBe(4000);
  });

  it('spreads simultaneous retries instead of returning one fixed delay', () => {
    // Without jitter every run backing off from the same rate limit returns at the
    // same instant and hits it again together.
    const delays = new Set(
      Array.from({ length: 50 }, () => globalThis.AsyncUtils.backoffDelay(1000, 1))
    );

    expect(delays.size).toBeGreaterThan(1);
  });

  it('never exceeds what setTimeout can honour, however many attempts have passed', () => {
    for (const attempt of [20, 25, 40, 100]) {
      const delay = globalThis.AsyncUtils.backoffDelay(5000, attempt);

      expect(delay).toBeLessThanOrEqual(SET_TIMEOUT_CEILING_MS);
    }
  });

  it('stays a real number where doubling alone would overflow to Infinity', () => {
    // 2^1024 is Infinity; setTimeout(Infinity) fires immediately, turning the backoff
    // into a tight loop against the service being retried.
    const delay = globalThis.AsyncUtils.backoffDelay(5000, 2000);

    expect(Number.isFinite(delay)).toBe(true);
    expect(delay).toBe(SET_TIMEOUT_CEILING_MS);
  });

  it('never returns less than a long delay the user configured', () => {
    // A connector facing a strict rate limit may be configured to wait minutes. Clamping
    // that down would retry too early and make the rate limiting worse.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    expect(globalThis.AsyncUtils.backoffDelay(300000, 1)).toBe(300000);
    expect(globalThis.AsyncUtils.backoffDelay(300000, 2)).toBe(600000);
  });

  it('leaves the default retry configuration untouched', () => {
    // MaxFetchRetries defaults to 3 with a 5s initial delay, so the cap must not
    // change what those runs already do.
    vi.spyOn(Math, 'random').mockReturnValue(1);

    expect(globalThis.AsyncUtils.backoffDelay(5000, 1)).toBe(7500);
    expect(globalThis.AsyncUtils.backoffDelay(5000, 2)).toBe(15000);
    expect(globalThis.AsyncUtils.backoffDelay(5000, 3)).toBe(30000);
  });
});
