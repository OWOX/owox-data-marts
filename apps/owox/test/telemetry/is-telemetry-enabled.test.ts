import { expect } from 'chai';

import { isTelemetryEnabled } from '../../src/telemetry/is-telemetry-enabled.js';

describe('isTelemetryEnabled', () => {
  it('is enabled by default (no relevant env)', () => {
    expect(isTelemetryEnabled({})).to.equal(true);
  });

  it('is disabled when OWOX_TELEMETRY_DISABLED is truthy', () => {
    expect(isTelemetryEnabled({ OWOX_TELEMETRY_DISABLED: '1' })).to.equal(false);
    expect(isTelemetryEnabled({ OWOX_TELEMETRY_DISABLED: 'true' })).to.equal(false);
  });

  it('is still enabled when OWOX_TELEMETRY_DISABLED is falsy', () => {
    expect(isTelemetryEnabled({ OWOX_TELEMETRY_DISABLED: '0' })).to.equal(true);
    expect(isTelemetryEnabled({ OWOX_TELEMETRY_DISABLED: 'false' })).to.equal(true);
    expect(isTelemetryEnabled({ OWOX_TELEMETRY_DISABLED: '' })).to.equal(true);
  });

  it('honors DO_NOT_TRACK=1', () => {
    expect(isTelemetryEnabled({ DO_NOT_TRACK: '1' })).to.equal(false);
    expect(isTelemetryEnabled({ DO_NOT_TRACK: 'true' })).to.equal(false);
  });

  it('ignores DO_NOT_TRACK=0', () => {
    expect(isTelemetryEnabled({ DO_NOT_TRACK: '0' })).to.equal(true);
  });

  it('is disabled in CI', () => {
    expect(isTelemetryEnabled({ CI: 'true' })).to.equal(false);
    expect(isTelemetryEnabled({ CI: '1' })).to.equal(false);
  });

  it('ignores CI=0/empty', () => {
    expect(isTelemetryEnabled({ CI: '0' })).to.equal(true);
    expect(isTelemetryEnabled({ CI: '' })).to.equal(true);
  });
});
