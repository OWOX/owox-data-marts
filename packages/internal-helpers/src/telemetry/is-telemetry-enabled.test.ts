import { isTelemetryEnabled } from './is-telemetry-enabled.js';

describe('isTelemetryEnabled', () => {
  it('is enabled by default (no relevant env)', () => {
    expect(isTelemetryEnabled({})).toBe(true);
  });

  it('is disabled when OWOX_TELEMETRY_DISABLED is truthy', () => {
    expect(isTelemetryEnabled({ OWOX_TELEMETRY_DISABLED: '1' })).toBe(false);
    expect(isTelemetryEnabled({ OWOX_TELEMETRY_DISABLED: 'true' })).toBe(false);
  });

  it('is still enabled when OWOX_TELEMETRY_DISABLED is falsy', () => {
    expect(isTelemetryEnabled({ OWOX_TELEMETRY_DISABLED: '0' })).toBe(true);
    expect(isTelemetryEnabled({ OWOX_TELEMETRY_DISABLED: 'false' })).toBe(true);
    expect(isTelemetryEnabled({ OWOX_TELEMETRY_DISABLED: '' })).toBe(true);
  });

  it('honors DO_NOT_TRACK=1', () => {
    expect(isTelemetryEnabled({ DO_NOT_TRACK: '1' })).toBe(false);
    expect(isTelemetryEnabled({ DO_NOT_TRACK: 'true' })).toBe(false);
  });

  it('ignores DO_NOT_TRACK=0', () => {
    expect(isTelemetryEnabled({ DO_NOT_TRACK: '0' })).toBe(true);
  });

  it('is disabled in CI', () => {
    expect(isTelemetryEnabled({ CI: 'true' })).toBe(false);
    expect(isTelemetryEnabled({ CI: '1' })).toBe(false);
  });

  it('ignores CI=0/empty', () => {
    expect(isTelemetryEnabled({ CI: '0' })).toBe(true);
    expect(isTelemetryEnabled({ CI: '' })).toBe(true);
  });
});
