jest.mock('../../../common/helpers/safe-url.helper', () => ({
  assertPublicHttpUrl: jest.fn((rawUrl: string) => Promise.resolve(new URL(rawUrl))),
}));

jest.mock('../../../common/helpers/guarded-dispatcher', () => ({
  withGuardedDispatcher: jest.fn((init: RequestInit) => init),
}));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { ResolvedCredentialBinding } from '../facades/credential-consumer-binding.facade';
import { CredentialFetchService } from './credential-fetch.service';

const binding: ResolvedCredentialBinding = {
  credentialId: 'credential-1',
  requirement: {
    key: 'github',
    definitionId: 'github',
    optional: false,
    models: [],
  },
  secret: { value: 'provider-secret' },
  definition: {
    id: 'github',
    displayName: 'GitHub',
    description: '',
    auth: { type: 'header', label: 'API key', headerName: 'authorization', prefix: 'Bearer ' },
    origins: ['https://api.github.com'],
  },
  aiModelMappings: null,
};

describe('CredentialFetchService', () => {
  beforeEach(() => {
    Object.defineProperty(global, 'fetch', {
      configurable: true,
      writable: true,
      value: jest.fn(),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Reflect.deleteProperty(global, 'fetch');
  });

  it('injects the Host secret and ignores a plugin-supplied auth header', async () => {
    const fetchMock = (global.fetch as jest.Mock).mockResolvedValue(
      new Response('{"login":"octocat"}', {
        status: 200,
        headers: { 'content-type': 'application/json', 'set-cookie': 'secret=session' },
      })
    );

    const response = await new CredentialFetchService().run(binding, {
      url: 'https://api.github.com/user',
      method: 'GET',
      headers: { authorization: 'Bearer attacker', accept: 'application/json' },
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get('authorization')).toBe('Bearer provider-secret');
    expect(headers.get('accept')).toBe('application/json');
    expect(response.status).toBe(200);
    expect(response.headers).not.toHaveProperty('set-cookie');
    expect(Buffer.from(response.bodyBase64, 'base64').toString()).toContain('octocat');
    expect(JSON.stringify(response)).not.toContain('provider-secret');
  });

  it('rejects an origin that is not declared without reaching the network', async () => {
    const fetchMock = global.fetch as jest.Mock;

    await expect(
      new CredentialFetchService().run(binding, {
        url: 'https://attacker.example/collect',
        method: 'GET',
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves custom Fetch-compatible methods', async () => {
    const fetchMock = (global.fetch as jest.Mock).mockResolvedValue(
      new Response(null, { status: 204 })
    );

    await new CredentialFetchService().run(binding, {
      url: 'https://api.github.com/resource',
      method: 'PROPFIND',
    });

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'PROPFIND' });
  });

  it.each(['bad name', 'bad:name'])(
    'rejects invalid request header name %s as a 400',
    async name => {
      await expect(
        new CredentialFetchService().run(binding, {
          url: 'https://api.github.com/user',
          method: 'GET',
          headers: { [name]: 'value' },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(global.fetch).not.toHaveBeenCalled();
    }
  );

  it('revalidates the target origin on every redirect', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: 'https://attacker.example/collect' },
      })
    );

    await expect(
      new CredentialFetchService().run(binding, {
        url: 'https://api.github.com/user',
        method: 'GET',
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('follows 303 with GET and drops the original request body', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        new Response(null, {
          status: 303,
          headers: { location: 'https://api.github.com/result' },
        })
      )
      .mockResolvedValueOnce(new Response('done', { status: 200 }));

    await new CredentialFetchService().run(binding, {
      url: 'https://api.github.com/jobs',
      method: 'POST',
      bodyBase64: Buffer.from('payload').toString('base64'),
    });

    expect((global.fetch as jest.Mock).mock.calls[0][1]).toMatchObject({ method: 'POST' });
    expect((global.fetch as jest.Mock).mock.calls[1][1]).toMatchObject({
      method: 'GET',
      body: undefined,
    });
  });
});
