import { describe, expect, it } from 'vitest';
import type { PluginRequest } from './protocol.js';

const v2Requests: PluginRequest[] = [
  { id: 'get', kind: 'api', method: 'GET', path: '/api/x' },
  { id: 'post', kind: 'api', method: 'POST', path: '/api/x', body: null },
  { id: 'put', kind: 'api', method: 'PUT', path: '/api/x', body: {} },
  { id: 'patch', kind: 'api', method: 'PATCH', path: '/api/x', body: [] },
  { id: 'delete', kind: 'api', method: 'DELETE', path: '/api/x' },
  { id: 'stream', kind: 'api', method: 'GET', path: '/api/x', stream: true },
];

// @ts-expect-error Protocol v2 POST requests require a body property.
const bodylessPost: PluginRequest = {
  id: 'bodyless-post',
  kind: 'api',
  method: 'POST',
  path: '/api/x',
};

const getWithBody: PluginRequest = {
  id: 'get-with-body',
  kind: 'api',
  method: 'GET',
  path: '/api/x',
  // @ts-expect-error Protocol v2 GET requests never carry a body.
  body: {},
};

describe('protocol v2 request shapes', () => {
  it('models bodyless reads/deletes and required-body writes as distinct wire shapes', () => {
    expect(
      v2Requests.map(request => ('method' in request ? request.method : request.kind))
    ).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'GET']);
    expect(bodylessPost).toBeDefined();
    expect(getWithBody).toBeDefined();
  });
});
