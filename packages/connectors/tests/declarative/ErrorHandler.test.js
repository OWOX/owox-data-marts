import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  ErrorHandler,
  MAX_HEADER_RETRY_DELAY_MS,
} from '../../src/Core/Declarative/ErrorHandler.js';

describe('ErrorHandler', () => {
  it('actionFor returns the first matching filter action', () => {
    const eh = new ErrorHandler({
      responseFilters: [
        { httpCodes: [429], action: 'RETRY' },
        { httpCodes: [404], action: 'IGNORE' },
      ],
    });
    assert.strictEqual(eh.actionFor(429), 'RETRY');
    assert.strictEqual(eh.actionFor(404), 'IGNORE');
  });

  it('actionFor returns null when no filter matches', () => {
    const eh = new ErrorHandler({ responseFilters: [{ httpCodes: [429], action: 'RETRY' }] });
    assert.strictEqual(eh.actionFor(500), null);
  });

  it('actionFor returns null with no filters', () => {
    assert.strictEqual(new ErrorHandler().actionFor(429), null);
  });

  it('retryDelayMs reads numeric seconds from the configured header', () => {
    const eh = new ErrorHandler({ backoff: { type: 'waitTimeFromHeader', header: 'Retry-After' } });
    const response = { headers: { get: n => (n === 'Retry-After' ? '2' : null) } };
    assert.strictEqual(eh.retryDelayMs(response), 2000);
  });

  it('retryDelayMs defaults the header name to Retry-After', () => {
    const eh = new ErrorHandler({ backoff: { type: 'waitTimeFromHeader' } });
    const response = { headers: { get: n => (n === 'Retry-After' ? '1' : null) } };
    assert.strictEqual(eh.retryDelayMs(response), 1000);
  });

  it('retryDelayMs returns null without a waitTimeFromHeader backoff', () => {
    assert.strictEqual(new ErrorHandler({}).retryDelayMs({ headers: { get: () => '5' } }), null);
  });

  it('retryDelayMs returns null when the header is absent', () => {
    const eh = new ErrorHandler({ backoff: { type: 'waitTimeFromHeader', header: 'Retry-After' } });
    assert.strictEqual(eh.retryDelayMs({ headers: { get: () => null } }), null);
  });

  it('retryDelayMs returns null for a null response', () => {
    const eh = new ErrorHandler({ backoff: { type: 'waitTimeFromHeader' } });
    assert.strictEqual(eh.retryDelayMs(null), null);
  });

  it('match returns the first filter matching by status code', () => {
    const eh = new ErrorHandler({
      responseFilters: [
        { httpCodes: [429], action: 'RETRY' },
        { httpCodes: [404], action: 'IGNORE' },
      ],
    });
    assert.strictEqual(eh.match(404, '', null).action, 'IGNORE');
    assert.strictEqual(eh.match(500, '', null), null);
  });

  it('match honours messageContains against the body text', () => {
    const eh = new ErrorHandler({
      responseFilters: [
        { httpCodes: [400], messageContains: 'No changes are scheduled', action: 'IGNORE' },
      ],
    });
    assert.strictEqual(
      eh.match(400, 'error: No changes are scheduled for this sub', null).action,
      'IGNORE'
    );
    assert.strictEqual(eh.match(400, 'something else', null), null);
  });

  it('match honours bodyMatch equals and contains via a json path', () => {
    const eh = new ErrorHandler({
      responseFilters: [
        {
          httpCodes: [403],
          bodyMatch: { path: ['error', 'type'], equals: 'INVALID' },
          action: 'FAIL',
        },
      ],
    });
    assert.strictEqual(eh.match(403, '{}', { error: { type: 'INVALID' } }).action, 'FAIL');
    assert.strictEqual(eh.match(403, '{}', { error: { type: 'OTHER' } }), null);
    assert.strictEqual(eh.match(403, '{}', null), null);

    const eh2 = new ErrorHandler({
      responseFilters: [{ bodyMatch: { path: ['msg'], contains: 'quota' }, action: 'IGNORE' }],
    });
    assert.strictEqual(eh2.match(500, '{}', { msg: 'monthly quota exceeded' }).action, 'IGNORE');
  });

  it('match requires ALL present conditions (AND) and ignores an empty filter', () => {
    const eh = new ErrorHandler({
      responseFilters: [{ httpCodes: [400], messageContains: 'x', action: 'IGNORE' }],
    });
    assert.strictEqual(eh.match(400, 'no match here', null), null); // code matches, message does not
    const empty = new ErrorHandler({ responseFilters: [{ httpCodes: [], action: 'RETRY' }] });
    assert.strictEqual(empty.match(500, '', null), null); // empty filter never matches
  });

  it('needsBody is true only when a filter has messageContains or bodyMatch', () => {
    assert.strictEqual(
      new ErrorHandler({ responseFilters: [{ httpCodes: [429], action: 'RETRY' }] }).needsBody(),
      false
    );
    assert.strictEqual(
      new ErrorHandler({
        responseFilters: [{ httpCodes: [400], messageContains: 'x', action: 'IGNORE' }],
      }).needsBody(),
      true
    );
    assert.strictEqual(
      new ErrorHandler({
        responseFilters: [{ bodyMatch: { path: ['a'], equals: 'b' }, action: 'FAIL' }],
      }).needsBody(),
      true
    );
  });

  it('delayMs computes constant and exponential delays', () => {
    const c = new ErrorHandler({});
    assert.strictEqual(
      c.delayMs({ backoff: { type: 'constant', delayMs: 250 } }, null, 5, 5000),
      250
    );
    const e = new ErrorHandler({});
    assert.strictEqual(
      e.delayMs({ backoff: { type: 'exponential', factor: 2, baseMs: 1000 } }, null, 0, 5000),
      1000
    );
    assert.strictEqual(
      e.delayMs({ backoff: { type: 'exponential', factor: 2, baseMs: 1000 } }, null, 3, 5000),
      8000
    );
    // baseMs defaults to initialDelay
    assert.strictEqual(
      e.delayMs({ backoff: { type: 'exponential', factor: 3 } }, null, 1, 100),
      300
    );
  });

  it('delayMs falls back to the handler-level backoff when the filter has none', () => {
    const eh = new ErrorHandler({ backoff: { type: 'constant', delayMs: 700 } });
    assert.strictEqual(eh.delayMs(null, null, 0, 5000), 700);
    assert.strictEqual(eh.delayMs({}, null, 0, 5000), 700);
  });

  it('delayMs reads waitTimeFromHeader and waitUntilTimeFromHeader', () => {
    const eh = new ErrorHandler({});
    const r1 = { headers: { get: n => (n === 'Retry-After' ? '2' : null) } };
    assert.strictEqual(eh.delayMs({ backoff: { type: 'waitTimeFromHeader' } }, r1, 0, 5000), 2000);
    const future = Math.floor(Date.now() / 1000) + 30; // 30s ahead
    const r2 = { headers: { get: n => (n === 'X-Reset' ? `prefix ${future} suffix` : null) } };
    const ms = eh.delayMs(
      {
        backoff: {
          type: 'waitUntilTimeFromHeader',
          header: 'X-Reset',
          regex: '(\\d{10})',
          minMs: 0,
        },
      },
      r2,
      0,
      5000
    );
    assert.ok(ms > 25000 && ms <= 30000, `expected ~30000, got ${ms}`);
    // minMs floor when the timestamp is already in the past
    const past = Math.floor(Date.now() / 1000) - 100;
    const r3 = { headers: { get: () => String(past) } };
    assert.strictEqual(
      eh.delayMs(
        { backoff: { type: 'waitUntilTimeFromHeader', header: 'X-Reset', minMs: 1500 } },
        r3,
        0,
        5000
      ),
      1500
    );
  });

  describe('server-controlled retry delays are clamped to a ceiling', () => {
    // A hostile or broken upstream fully controls these header values. Unclamped,
    // `Retry-After: 2147483` parks the connector child process -- and its
    // concurrency slot -- for 24.85 days, and anything past that overflows the
    // setTimeout int32 argument and collapses to ~1ms. Both ends are wrong.
    it('waitTimeFromHeader clamps absurd numeric seconds', () => {
      const eh = new ErrorHandler({ backoff: { type: 'waitTimeFromHeader' } });
      const response = { headers: { get: () => '2147483' } };
      assert.strictEqual(eh.delayMs(null, response, 0, 5000), MAX_HEADER_RETRY_DELAY_MS);
    });

    it('waitTimeFromHeader clamps a far-future HTTP-date', () => {
      const eh = new ErrorHandler({ backoff: { type: 'waitTimeFromHeader' } });
      const farFuture = new Date(Date.now() + 400 * 24 * 3600 * 1000).toUTCString();
      const response = { headers: { get: () => farFuture } };
      assert.strictEqual(eh.delayMs(null, response, 0, 5000), MAX_HEADER_RETRY_DELAY_MS);
    });

    it('waitUntilTimeFromHeader clamps a far-future epoch timestamp', () => {
      const eh = new ErrorHandler({});
      const farFuture = Math.floor(Date.now() / 1000) + 400 * 24 * 3600;
      const response = { headers: { get: () => String(farFuture) } };
      assert.strictEqual(
        eh.delayMs(
          { backoff: { type: 'waitUntilTimeFromHeader', header: 'X-Reset', minMs: 0 } },
          response,
          0,
          5000
        ),
        MAX_HEADER_RETRY_DELAY_MS
      );
    });

    it('retryDelayMs (back-compat entry point) clamps too', () => {
      const eh = new ErrorHandler({
        backoff: { type: 'waitTimeFromHeader', header: 'Retry-After' },
      });
      assert.strictEqual(
        eh.retryDelayMs({ headers: { get: () => '999999' } }),
        MAX_HEADER_RETRY_DELAY_MS
      );
    });

    it('a minMs floor above the ceiling still cannot exceed the ceiling', () => {
      const eh = new ErrorHandler({});
      const past = Math.floor(Date.now() / 1000) - 100;
      assert.strictEqual(
        eh.delayMs(
          {
            backoff: {
              type: 'waitUntilTimeFromHeader',
              header: 'X-Reset',
              minMs: MAX_HEADER_RETRY_DELAY_MS * 10,
            },
          },
          { headers: { get: () => String(past) } },
          0,
          5000
        ),
        MAX_HEADER_RETRY_DELAY_MS
      );
    });

    it('leaves realistic delays untouched', () => {
      const eh = new ErrorHandler({ backoff: { type: 'waitTimeFromHeader' } });
      assert.strictEqual(eh.delayMs(null, { headers: { get: () => '30' } }, 0, 5000), 30000);
      assert.strictEqual(eh.delayMs(null, { headers: { get: () => '0' } }, 0, 5000), 0);
    });
  });
});
