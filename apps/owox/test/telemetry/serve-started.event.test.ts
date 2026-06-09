import { isTelemetryEvent } from '@owox/internal-helpers';
import { expect } from 'chai';

import { ServeStartedEvent } from '../../src/telemetry/events/serve-started.event.js';

describe('ServeStartedEvent', () => {
  const payload = {
    anonymousId: 'uuid-1',
    /* eslint-disable camelcase */
    cli_version: '0.26.0',
    idp_provider: 'none',
    is_docker: false,
    node_version: 'v22.16.0',
    os_arch: 'arm64',
    os_platform: 'darwin',
    web_enabled: true,
    /* eslint-enable camelcase */
  };

  it('has the correct event name', () => {
    const event = new ServeStartedEvent(payload);
    expect(event.name).to.equal('cli.serve.started');
  });

  it('carries the payload', () => {
    const event = new ServeStartedEvent(payload);
    expect(event.payload).to.deep.equal(payload);
  });

  it('is recognized as a telemetry event', () => {
    const event = new ServeStartedEvent(payload);
    expect(isTelemetryEvent(event)).to.equal(true);
  });
});
