import { describe, it, expect } from 'vitest';
import {
  createDefaultAuthentication,
  createDefaultPagination,
  createDefaultIncremental,
  createDefaultTransform,
  createDefaultErrorHandler,
  createDefaultResponseFilter,
} from './manifest.types';

describe('createDefaultAuthentication', () => {
  it('apiKey preset injects into query with a parameter template', () => {
    expect(createDefaultAuthentication('apiKey')).toEqual({
      type: 'apiKey',
      inject: { into: 'query', name: 'api_key', format: '{{ parameters.ApiKey }}' },
    });
  });
  it('bearer preset injects an Authorization header', () => {
    expect(createDefaultAuthentication('bearer')).toEqual({
      type: 'bearer',
      inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ parameters.Token }}' },
    });
  });
  it('tokenExchange preset has exchange defaults and an auth.token inject', () => {
    expect(createDefaultAuthentication('tokenExchange')).toEqual({
      type: 'tokenExchange',
      exchange: { url: '', method: 'POST', body: {}, tokenPath: ['token'], ttlSeconds: 3600 },
      inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
    });
  });
  it('basic preset has empty username and password', () => {
    expect(createDefaultAuthentication('basic')).toEqual({
      type: 'basic',
      username: '',
      password: '',
    });
  });
  it('oauth2 preset defaults to the refresh_token grant with an auth.token inject', () => {
    expect(createDefaultAuthentication('oauth2')).toEqual({
      type: 'oauth2',
      tokenUrl: '',
      grantType: 'refresh_token',
      clientId: '',
      clientSecret: '',
      refreshToken: '',
      inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
    });
  });
});

describe('createDefaultPagination', () => {
  it('offset preset', () => {
    expect(createDefaultPagination('offset')).toEqual({
      type: 'offset',
      offsetParam: 'offset',
      pageSize: 100,
    });
  });
  it('page preset', () => {
    expect(createDefaultPagination('page')).toEqual({
      type: 'page',
      pageParam: 'page',
      startPage: 1,
    });
  });
  it('cursor preset', () => {
    expect(createDefaultPagination('cursor')).toEqual({
      type: 'cursor',
      cursorPath: ['next'],
      cursorParam: 'cursor',
    });
  });
  it('none preset', () => {
    expect(createDefaultPagination('none')).toEqual({ type: 'none' });
  });
});

describe('createDefaultIncremental', () => {
  // `cursorField` is deliberately absent: nothing in the engine
  // (`packages/connectors/src`) ever reads it, so seeding it would only teach authors a
  // key that does nothing.
  it('day-by-day preset injects start into query', () => {
    expect(createDefaultIncremental('day-by-day')).toEqual({
      strategy: 'day-by-day',
      request: { into: 'query', startName: 'date', format: 'YYYY-MM-DD' },
    });
  });
  it('range preset injects start and end into query', () => {
    expect(createDefaultIncremental('range')).toEqual({
      strategy: 'range',
      request: {
        into: 'query',
        startName: 'start_date',
        endName: 'end_date',
        format: 'YYYY-MM-DD',
      },
    });
  });
  it('none preset', () => {
    expect(createDefaultIncremental('none')).toEqual({ strategy: 'none' });
  });
});

describe('createDefaultTransform', () => {
  it('add preset', () => {
    expect(createDefaultTransform('add')).toEqual({ type: 'add', field: '', value: '' });
  });
  it('remove preset', () => {
    expect(createDefaultTransform('remove')).toEqual({ type: 'remove', field: '' });
  });
  it('keysToLower preset', () => {
    expect(createDefaultTransform('keysToLower')).toEqual({ type: 'keysToLower' });
  });
  it('flatten preset has the default "_" separator', () => {
    expect(createDefaultTransform('flatten')).toEqual({ type: 'flatten', separator: '_' });
  });
});

describe('createDefaultErrorHandler', () => {
  it('error handler preset has an empty filter list', () => {
    expect(createDefaultErrorHandler()).toEqual({ responseFilters: [] });
  });
  it('response filter preset defaults to a RETRY action with no codes', () => {
    expect(createDefaultResponseFilter()).toEqual({ httpCodes: [], action: 'RETRY' });
  });
});
