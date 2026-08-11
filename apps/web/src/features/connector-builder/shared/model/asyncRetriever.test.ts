import { describe, it, expect } from 'vitest';
import { createDefaultAsyncRetriever } from './manifest.types';

describe('createDefaultAsyncRetriever', () => {
  it('returns a valid async skeleton with engine-default poll backoff', () => {
    expect(createDefaultAsyncRetriever()).toEqual({
      type: 'async',
      submit: { method: 'GET', path: '', jobIdPath: [] },
      poll: {
        method: 'GET',
        path: '',
        statusPath: [],
        readyValue: '',
        resultUrlPath: [],
        backoff: { maxAttempts: 180, initialMs: 3000, maxMs: 15000 },
      },
      download: { recordPath: [] },
    });
  });
});
