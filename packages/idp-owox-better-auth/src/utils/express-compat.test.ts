import { describe, expect, it, jest } from '@jest/globals';
import type { Request as ExpressRequest } from 'express';

import { convertExpressHeaders, convertExpressToFetchRequest } from './express-compat.js';

const createRequest = (overrides: Partial<ExpressRequest>): ExpressRequest =>
  ({
    headers: {},
    protocol: 'http',
    get: jest.fn().mockReturnValue('example.com'),
    originalUrl: '/path',
    method: 'GET',
    ...overrides,
  }) as unknown as ExpressRequest;

describe('express-compat', () => {
  it('converts express headers including arrays', () => {
    const req = createRequest({
      headers: {
        'x-multi': ['a', 'b'],
        'x-single': 'one',
        'x-empty': undefined,
      },
    });

    const headers = convertExpressHeaders(req);

    expect(headers.get('x-multi')).toBe('a, b');
    expect(headers.get('x-single')).toBe('one');
    expect(headers.has('x-empty')).toBe(false);
  });

  it('converts GET request without body', async () => {
    const req = createRequest({ protocol: 'https', originalUrl: '/path?x=1' });

    const fetchReq = convertExpressToFetchRequest(req);

    expect(fetchReq.url).toBe('https://example.com/path?x=1');
    expect(fetchReq.method).toBe('GET');
    expect(fetchReq.headers.get('content-length')).toBeNull();
    expect(await fetchReq.text()).toBe('');
  });

  it('converts non-GET request with object body to JSON and content-length', async () => {
    const body = { foo: 'bar' };
    const req = createRequest({
      method: 'post',
      body,
      headers: {},
    });

    const fetchReq = convertExpressToFetchRequest(req);

    expect(fetchReq.method).toBe('POST');
    expect(fetchReq.headers.get('content-type')).toBe('application/json');
    const text = await fetchReq.text();
    expect(text).toBe(JSON.stringify(body));
    expect(fetchReq.headers.get('content-length')).toBe(String(Buffer.byteLength(text)));
  });
});
