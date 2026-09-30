import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from '../../../../utils/data-layer';
import { apiHostOf, describeFailure, trackCustomConnectorEvent } from './analytics';
import type { BuilderManifest } from './manifest.types';

vi.mock('../../../../utils/data-layer', () => ({ trackEvent: vi.fn() }));

const manifest = {
  version: '1.0',
  name: 'ImpactPartnerCosts',
  title: 'Impact partner costs',
  baseUrl: 'https://API.impact.com/Advertisers/{{ parameters.AccountSid }}?key=secret-in-url',
  parameters: { AuthToken: { type: 'string', requiredType: 'string', isSecret: true } },
  nodes: {
    daily: {
      request: { method: 'GET', path: '/Reports/daily' },
      recordSelector: { recordPath: ['Records'] },
      fields: {},
      incremental: { strategy: 'day-by-day', request: { into: 'query', startName: 'START' } },
    },
    totals: {
      request: { method: 'GET', path: '/Reports/totals' },
      recordSelector: { recordPath: ['Records'] },
      fields: {},
      incremental: { strategy: 'range', request: { into: 'query', startName: 'S', endName: 'E' } },
    },
    campaigns: {
      request: { method: 'GET', path: '/Campaigns' },
      recordSelector: { recordPath: ['Campaigns'] },
      fields: {},
    },
  },
  authentication: { type: 'basic', username: 'sid-123', password: 'typed-password' },
} as unknown as BuilderManifest;

const lastEvent = () => vi.mocked(trackEvent).mock.calls.at(-1)?.[0];

describe('trackCustomConnectorEvent', () => {
  beforeEach(() => {
    vi.mocked(trackEvent).mockClear();
  });

  it('sends the connector properties with the event', () => {
    trackCustomConnectorEvent(
      'custom_connector_published',
      { id: 'c-1', manifest },
      { version: 2, warningsCount: 0 }
    );

    expect(lastEvent()).toEqual({
      event: 'custom_connector_published',
      category: 'CustomConnector',
      action: 'Published',
      label: 'ImpactPartnerCosts',
      connectorId: 'c-1',
      connectorName: 'ImpactPartnerCosts',
      connectorTitle: 'Impact partner costs',
      apiHost: 'api.impact.com',
      nodesCount: 3,
      authType: 'basic',
      dateStrategies: 'day-by-day,range',
      version: 2,
      warningsCount: 0,
    });
  });

  it('never sends what the author typed into the manifest beyond its name and title', () => {
    trackCustomConnectorEvent('custom_connector_created', { id: 'c-1', manifest });

    const sent = JSON.stringify(lastEvent());
    for (const secret of ['typed-password', 'sid-123', 'secret-in-url', 'AccountSid', 'Reports']) {
      expect(sent).not.toContain(secret);
    }
  });

  it('describes a connector known only by its list entry', () => {
    trackCustomConnectorEvent(
      'custom_connector_version_pinned',
      { id: 'c-1', name: 'ImpactPartnerCosts', title: 'Impact partner costs' },
      { action: 'Pin', version: 3 }
    );

    expect(lastEvent()).toEqual({
      event: 'custom_connector_version_pinned',
      category: 'CustomConnector',
      action: 'Pin',
      label: 'ImpactPartnerCosts',
      connectorId: 'c-1',
      connectorName: 'ImpactPartnerCosts',
      connectorTitle: 'Impact partner costs',
      apiHost: null,
      nodesCount: null,
      authType: null,
      dateStrategies: null,
      version: 3,
    });
  });

  it('marks a new connector as not saved yet and without authentication', () => {
    trackCustomConnectorEvent('custom_connector_builder_opened', {
      id: null,
      manifest: { version: '1.0', name: '', baseUrl: '', parameters: {}, nodes: {} },
    });

    expect(lastEvent()).toMatchObject({
      action: 'Opened',
      label: undefined,
      connectorId: null,
      connectorName: null,
      apiHost: null,
      nodesCount: 0,
      authType: 'none',
      dateStrategies: 'none',
    });
  });
});

describe('apiHostOf', () => {
  it.each([
    ['https://API.Example.com/v1?token=abc', 'api.example.com'],
    ['https://api.example.com:8443/v1', 'api.example.com'],
    ['https://{{ parameters.Host }}/v1', null],
    ['api.example.com/v1', null],
    ['', null],
    [undefined, null],
  ])('%s -> %s', (baseUrl, host) => {
    expect(apiHostOf(baseUrl)).toBe(host);
  });
});

describe('describeFailure', () => {
  it.each([
    ['HTTP 401: Unauthorized', 'auth', 401],
    ['Error processing account 7: HTTP 403: Forbidden', 'auth', 403],
    ['HTTP 404: Not Found — {"message":"no such report"}', 'http_4xx', 404],
    ['HTTP 503: Service Unavailable', 'http_5xx', 503],
    ['The test timed out after 60 seconds', 'timeout', null],
    [
      "Unable to load the configuration. The parameter 'ApiKey' is required",
      'invalid_manifest',
      null,
    ],
    ['Manifest is invalid: nodes.daily.request.path is required', 'invalid_manifest', null],
    ['Something else went wrong', 'other', null],
  ])('%s -> %s', (message, errorKind, httpStatus) => {
    expect(describeFailure(message)).toEqual({ errorKind, httpStatus });
  });
});
