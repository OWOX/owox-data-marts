import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from '../../../../utils/data-layer';
import { AxiosError, AxiosHeaders } from 'axios';
import {
  apiHostOf,
  describeApiFailure,
  describeFailure,
  trackCustomConnectorEvent,
} from './analytics';
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
      apiHost: '*.impact.com',
      nodesCount: 3,
      authType: 'basic',
      dateStrategies: 'day-by-day,range',
      version: 2,
      warningsCount: 0,
      context: null,
      value: null,
      error: null,
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
      context: null,
      value: null,
      error: null,
    });
  });

  it('names the version the builder has open', () => {
    trackCustomConnectorEvent('custom_connector_mode_switched', {
      id: 'c-1',
      manifest,
      version: 4,
    });

    expect(lastEvent()).toMatchObject({ connectorId: 'c-1', version: 4 });
  });

  // Import JSON and Code mode accept any JSON, and the rest of the builder copes with a null
  // title; tracking threw on it, from the effects that run when the builder opens.
  it('copes with a manifest whose name, title and nodes are null', () => {
    const broken = {
      ...manifest,
      name: null,
      title: null,
      nodes: null,
    } as unknown as BuilderManifest;

    expect(() => {
      trackCustomConnectorEvent('custom_connector_builder_opened', { id: 'c-1', manifest: broken });
    }).not.toThrow();
    expect(lastEvent()).toMatchObject({
      connectorName: null,
      connectorTitle: null,
      nodesCount: 0,
    });
  });

  it('never lets a tracking failure reach the flow that tracks', () => {
    vi.mocked(trackEvent).mockImplementationOnce(() => {
      throw new Error('dataLayer is gone');
    });

    expect(() => {
      trackCustomConnectorEvent('custom_connector_deleted', { id: 'c-1', manifest });
    }).not.toThrow();
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
  // The leftmost label of a longer host is often the customer's own account.
  it.each([
    ['https://API.Example.com/v1?token=abc', '*.example.com'],
    ['https://api.example.com:8443/v1', '*.example.com'],
    ['https://acme.zendesk.com/api/v2', '*.zendesk.com'],
    ['https://shop.acme.myshopify.com/admin', '*.myshopify.com'],
    ['https://api.example.co.uk/v1', '*.example.co.uk'],
    ['https://example.com/v1', 'example.com'],
    ['https://10.0.0.1/v1', null],
    ['https://[::1]/v1', null],
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
      'invalid_configuration',
      null,
    ],
    [
      'Invalid manifest: ManifestParser: node "x" must start with a letter',
      'invalid_manifest',
      null,
    ],
    ['Something else went wrong', 'other', null],
  ])('%s -> %s', (message, errorKind, httpStatus) => {
    expect(describeFailure(message)).toEqual({ errorKind, httpStatus });
  });
});

describe('describeApiFailure', () => {
  const rejection = (status: number, data: Record<string, unknown>) =>
    new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
      status,
      statusText: '',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data,
    });

  // An ODM refusal carries its status and code on the response, not as "HTTP nnn" in the text.
  it.each([
    [403, { message: 'would change what runs in Data Marts you cannot edit' }, 'permission'],
    [409, { message: "A custom connector named 'X' already exists in this project" }, 'conflict'],
    [
      400,
      { message: 'Invalid manifest: ManifestParser: missing required key "version"' },
      'invalid_manifest',
    ],
    [400, { message: 'Node "items" has no primary key' }, 'http_4xx'],
    [500, { message: 'Internal server error' }, 'http_5xx'],
  ])('%s %j -> %s', (status, data, errorKind) => {
    expect(describeApiFailure(rejection(status, { ...data, code: 'SOME_CODE' }))).toEqual({
      errorKind,
      httpStatus: status,
      errorCode: 'SOME_CODE',
    });
  });

  it('names a request that never got a response', () => {
    expect(describeApiFailure(new AxiosError('Network Error', 'ERR_NETWORK'))).toEqual({
      errorKind: 'network',
      httpStatus: null,
      errorCode: null,
    });
  });

  it('describes anything else as other', () => {
    expect(describeApiFailure(new Error('boom'))).toEqual({
      errorKind: 'other',
      httpStatus: null,
      errorCode: null,
    });
  });
});
