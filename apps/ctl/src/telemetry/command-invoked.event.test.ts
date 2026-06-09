import { isTelemetryEvent } from '@owox/internal-helpers';

import { CommandInvokedEvent } from './command-invoked.event.js';

describe('CommandInvokedEvent', () => {
  /* eslint-disable camelcase */
  const payload = {
    anonymousId: 'uuid-1',
    cli_version: '0.26.0',
    command: 'data-marts:list',
    node_version: 'v22.16.0',
    os_arch: 'x64',
    os_platform: 'linux',
  };
  /* eslint-enable camelcase */

  it('has the correct event name', () => {
    expect(new CommandInvokedEvent(payload).name).toBe('cli.command.invoked');
  });

  it('carries the payload', () => {
    expect(new CommandInvokedEvent(payload).payload).toEqual(payload);
  });

  it('is a telemetry event', () => {
    expect(isTelemetryEvent(new CommandInvokedEvent(payload))).toBe(true);
  });
});
