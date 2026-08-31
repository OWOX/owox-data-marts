/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * Proactive request pacing for declarative connectors. A SlidingWindowRateLimiter
 * lets at most `requests` requests START within any `windowMs` window; callers
 * await acquire() before each request. UnlimitedRateLimiter is the no-op default
 * (no rateLimit declared → existing connectors are unaffected). Requests run
 * sequentially in the engine, so a single timestamp log needs no locking.
 */

const defaultNow = () => Date.now();
const defaultSleep = ms => new Promise(r => setTimeout(r, ms));

export class SlidingWindowRateLimiter {
  /**
   * @param {object} cfg
   * @param {number} cfg.requests - max requests per window (positive integer)
   * @param {number} cfg.windowMs - window length in ms (positive)
   * @param {() => number} [cfg.now] - injectable clock (ms epoch)
   * @param {(ms: number) => Promise<void>} [cfg.sleep] - injectable sleep
   */
  constructor({ requests, windowMs, now = defaultNow, sleep = defaultSleep }) {
    this.requests = requests;
    this.windowMs = windowMs;
    this.now = now;
    this.sleep = sleep;
    this._times = [];
  }

  /** Resolves when a request slot is free, recording the request time. */
  async acquire() {
    // Prune expired timestamps; if the window is full, sleep until the oldest
    // exits, then re-evaluate. Sequential callers → one sleep in practice.
    for (;;) {
      const t = this.now();
      const cutoff = t - this.windowMs;
      while (this._times.length > 0 && this._times[0] <= cutoff) {
        this._times.shift();
      }
      if (this._times.length < this.requests) {
        this._times.push(t);
        return;
      }
      const wait = this._times[0] + this.windowMs - t;
      await this.sleep(wait > 0 ? wait : 0);
    }
  }
}

export class UnlimitedRateLimiter {
  async acquire() {}
}

/**
 * Builds a rate limiter from a manifest `rateLimit` config. Returns an Unlimited
 * no-op when the config is absent or non-positive (defense-in-depth — a parsed
 * manifest has already been validated by ManifestParser). `deps.now`/`deps.sleep`
 * are forwarded for deterministic tests.
 * @param {{requests?: number, perSeconds?: number}|null|undefined} config
 * @param {{now?: () => number, sleep?: (ms:number)=>Promise<void>}} [deps]
 * @returns {SlidingWindowRateLimiter|UnlimitedRateLimiter}
 */
export function createRateLimiter(config, deps = {}) {
  if (!config || !(config.requests > 0) || !(config.perSeconds > 0)) {
    return new UnlimitedRateLimiter();
  }
  return new SlidingWindowRateLimiter({
    requests: config.requests,
    windowMs: config.perSeconds * 1000,
    now: deps.now,
    sleep: deps.sleep,
  });
}
