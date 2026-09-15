import { validateConfig } from './env-validation.config';

/**
 * The boot-time schema is the only place a bad numeric setting can be caught.
 *
 * `.passthrough()` means anything absent from the schema reaches consumers as the raw
 * string it was written as, and the consumers guard with ordinary comparisons that a
 * non-numeric string quietly survives. `CONNECTOR_RUN_LOG_FLUSH_INTERVAL_MS` is the case
 * that made this concrete: `'abc' <= 0` is false, so the run-log flusher was armed anyway,
 * and `setInterval(fn, NaN)` clamps to roughly 1ms -- a busy loop rewriting the run's whole
 * log buffer to the database for as long as the connector ran. These cases exist so the
 * variable can never quietly leave the schema again.
 */
describe('validateConfig', () => {
  describe('CONNECTOR_RUN_LOG_FLUSH_INTERVAL_MS', () => {
    it('defaults to 2000 when unset', () => {
      expect(validateConfig({}).CONNECTOR_RUN_LOG_FLUSH_INTERVAL_MS).toBe(2_000);
    });

    it('coerces a numeric string to a number, so consumers never compare strings', () => {
      const config = validateConfig({ CONNECTOR_RUN_LOG_FLUSH_INTERVAL_MS: '5000' });

      expect(config.CONNECTOR_RUN_LOG_FLUSH_INTERVAL_MS).toBe(5_000);
      expect(typeof config.CONNECTOR_RUN_LOG_FLUSH_INTERVAL_MS).toBe('number');
    });

    // The regression this schema entry exists for: a value that survives `<= 0` but
    // becomes NaN inside setInterval must never reach the flusher.
    it.each([['abc'], ['2s'], ['NaN'], ['Infinity']])(
      'rejects the non-numeric value %p at boot instead of passing it through',
      value => {
        expect(() => validateConfig({ CONNECTOR_RUN_LOG_FLUSH_INTERVAL_MS: value })).toThrow(
          /Configuration validation failed/
        );
      }
    );

    it.each([
      ['a negative interval', '-1'],
      ['a fractional interval', '1.5'],
      ['an interval beyond the one-hour ceiling', '3600001'],
    ])('rejects %s', (_label, value) => {
      expect(() => validateConfig({ CONNECTOR_RUN_LOG_FLUSH_INTERVAL_MS: value })).toThrow(
        /Configuration validation failed/
      );
    });

    // 0 is the documented switch for "write logs once, when the run ends". Validation
    // must not take it away, because the flusher still reads it as the disable signal.
    it('keeps 0 legal as the documented way to disable incremental streaming', () => {
      expect(validateConfig({ CONNECTOR_RUN_LOG_FLUSH_INTERVAL_MS: '0' })).toMatchObject({
        CONNECTOR_RUN_LOG_FLUSH_INTERVAL_MS: 0,
      });
    });
  });

  describe('connector test concurrency caps', () => {
    it('applies the documented defaults', () => {
      const config = validateConfig({});

      expect(config.MAX_CONNECTOR_TESTS_PER_PROJECT).toBe(3);
      expect(config.MAX_CONNECTOR_TESTS_TOTAL).toBe(10);
    });

    // A cap of 0 would admit no connector test at all while looking like a configured
    // value, so the floor of 1 is what keeps a typo from silently closing the feature.
    it.each([['MAX_CONNECTOR_TESTS_PER_PROJECT'], ['MAX_CONNECTOR_TESTS_TOTAL']])(
      'rejects a zero or non-numeric %s',
      key => {
        expect(() => validateConfig({ [key]: '0' })).toThrow(/Configuration validation failed/);
        expect(() => validateConfig({ [key]: 'many' })).toThrow(/Configuration validation failed/);
      }
    );
  });
});
