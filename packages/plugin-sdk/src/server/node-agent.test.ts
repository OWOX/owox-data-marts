// @vitest-environment node
import dns from 'node:dns';
import { afterEach, expect, it, vi } from 'vitest';
import { createBackend } from './node.js';

afterEach(() => vi.restoreAllMocks());

// The real undici agent, so an upgrade that stopped calling connect.lookup would fail here.
it('refuses a host whose name resolves to a private address before connecting', async () => {
  const lookup = vi
    .spyOn(dns, 'lookup')
    .mockImplementation(((
      _hostname: string,
      _options: object,
      callback: (error: null, addresses: { address: string; family: number }[]) => void
    ) => callback(null, [{ address: '127.0.0.1', family: 4 }])) as never);

  const response = await createBackend({ repositoryId: '987654321', actions: {} }).fetch(
    new Request('https://backend.acme.test/owox', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-owox-execution-token': 'execution-token' },
      body: JSON.stringify({ owox: 1, host: 'https://odm.example.test', executionId: 'e1' }),
    })
  );

  expect({ status: response.status, body: await response.json() }).toEqual({
    status: 403,
    body: {
      error: {
        code: 'HOST_NOT_ALLOWED',
        message:
          'https://odm.example.test resolves to a private address; list internal deployments in hosts',
      },
    },
  });
  expect(lookup).toHaveBeenCalledWith(
    'odm.example.test',
    expect.objectContaining({ all: true }),
    expect.any(Function)
  );
});
