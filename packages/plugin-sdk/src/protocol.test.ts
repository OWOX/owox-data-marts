import { describe, expect, it } from 'vitest';
import type { PluginRequest } from './protocol.js';

const protocolRequests: PluginRequest[] = [
  { id: 'get', kind: 'api', method: 'GET', path: '/api/x' },
  { id: 'bodyless-post', kind: 'api', method: 'POST', path: '/api/x' },
  { id: 'post', kind: 'api', method: 'POST', path: '/api/x', body: null },
  { id: 'bodyless-put', kind: 'api', method: 'PUT', path: '/api/x' },
  { id: 'put', kind: 'api', method: 'PUT', path: '/api/x', body: {} },
  { id: 'patch', kind: 'api', method: 'PATCH', path: '/api/x', body: [] },
  { id: 'delete', kind: 'api', method: 'DELETE', path: '/api/x' },
  { id: 'stream', kind: 'api', method: 'GET', path: '/api/x', stream: true },
];

// @ts-expect-error PATCH requests require a body property.
const bodylessPatch: PluginRequest = {
  id: 'bodyless-patch',
  kind: 'api',
  method: 'PATCH',
  path: '/api/x',
};

const getWithBody: PluginRequest = {
  id: 'get-with-body',
  kind: 'api',
  method: 'GET',
  path: '/api/x',
  // @ts-expect-error GET requests never carry a body.
  body: {},
};

describe('protocol v1 request shapes', () => {
  it('adds PATCH and DELETE while preserving bodyless POST and PUT compatibility', () => {
    expect(
      protocolRequests.map(request => ('method' in request ? request.method : request.kind))
    ).toEqual(['GET', 'POST', 'POST', 'PUT', 'PUT', 'PATCH', 'DELETE', 'GET']);
    expect(bodylessPatch).toBeDefined();
    expect(getWithBody).toBeDefined();
  });
});
