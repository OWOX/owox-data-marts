import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  SlidingWindowRateLimiter,
  UnlimitedRateLimiter,
  createRateLimiter,
} from '../../src/Core/Declarative/rateLimiter.js';

describe('SlidingWindowRateLimiter', () => {
  it('allows up to `requests` without sleeping, then waits for the window to slide', async () => {
    let clock = 1000;
    const slept = [];
    const limiter = new SlidingWindowRateLimiter({
      requests: 2,
      windowMs: 1000,
      now: () => clock,
      sleep: async ms => {
        slept.push(ms);
        clock += ms;
      },
    });
    await limiter.acquire(); // t=1000, count 1
    await limiter.acquire(); // t=1000, count 2
    assert.deepStrictEqual(slept, []);
    await limiter.acquire(); // window full → wait oldest(1000)+1000-1000 = 1000ms
    assert.deepStrictEqual(slept, [1000]);
    assert.strictEqual(clock, 2000);
  });

  it('does not sleep when prior requests already aged out of the window', async () => {
    let clock = 0;
    const slept = [];
    const limiter = new SlidingWindowRateLimiter({
      requests: 1,
      windowMs: 100,
      now: () => clock,
      sleep: async ms => {
        slept.push(ms);
        clock += ms;
      },
    });
    await limiter.acquire(); // t=0
    clock = 150; // past the 100ms window
    await limiter.acquire(); // oldest aged out → no sleep
    assert.deepStrictEqual(slept, []);
  });
});

describe('UnlimitedRateLimiter', () => {
  it('acquire resolves immediately and never sleeps or throws', async () => {
    const limiter = new UnlimitedRateLimiter();
    const originalSetTimeout = globalThis.setTimeout;
    let setTimeoutCalls = 0;
    globalThis.setTimeout = (...args) => {
      setTimeoutCalls++;
      return originalSetTimeout(...args);
    };
    try {
      await limiter.acquire();
      await limiter.acquire();
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
    assert.strictEqual(
      setTimeoutCalls,
      0,
      'UnlimitedRateLimiter.acquire must never schedule a sleep'
    );
  });
});

describe('createRateLimiter', () => {
  it('returns Unlimited for falsy / non-positive config', () => {
    assert.ok(createRateLimiter(null) instanceof UnlimitedRateLimiter);
    assert.ok(createRateLimiter(undefined) instanceof UnlimitedRateLimiter);
    assert.ok(createRateLimiter({ requests: 0, perSeconds: 60 }) instanceof UnlimitedRateLimiter);
    assert.ok(createRateLimiter({ requests: 5, perSeconds: 0 }) instanceof UnlimitedRateLimiter);
  });

  it('returns a SlidingWindow with windowMs = perSeconds*1000 for a valid config', () => {
    const limiter = createRateLimiter({ requests: 5, perSeconds: 60 });
    assert.ok(limiter instanceof SlidingWindowRateLimiter);
    assert.strictEqual(limiter.requests, 5);
    assert.strictEqual(limiter.windowMs, 60000);
  });
});
