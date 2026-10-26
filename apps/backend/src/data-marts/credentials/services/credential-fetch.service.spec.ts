jest.mock('../../../common/helpers/safe-url.helper', () => ({
  assertPublicHttpUrl: jest.fn((rawUrl: string) => Promise.resolve(new URL(rawUrl))),
}));

jest.mock('../../../common/helpers/guarded-dispatcher', () => ({
  withGuardedDispatcher: jest.fn((init: RequestInit) => init),
}));

import { BadGatewayException, BadRequestException, ForbiddenException } from '@nestjs/common';
import type { ResolvedCredentialBinding } from '../facades/credential-consumer-binding.facade';
import { CredentialFetchService } from './credential-fetch.service';
import { GoogleTokenError } from './google-service-account-token.service';

const binding: ResolvedCredentialBinding = {
  credentialId: 'credential-1',
  requirement: {
    key: 'github',
    definitionId: 'github',
    optional: false,
    models: [],
    scopes: [],
  },
  secret: { value: 'provider-secret' },
  definition: {
    id: 'github',
    displayName: 'GitHub',
    description: '',
    category: 'other',
    auth: { type: 'header', label: 'API key', headerName: 'authorization', prefix: 'Bearer ' },
    origins: ['https://api.github.com'],
  },
  aiModelMappings: null,
};

const googleBinding: ResolvedCredentialBinding = {
  credentialId: 'credential-2',
  requirement: {
    key: 'google-service-account',
    definitionId: 'google-service-account',
    optional: false,
    models: [],
    scopes: ['https://www.googleapis.com/auth/documents'],
  },
  secret: { value: '{"type":"service_account"}' },
  definition: {
    id: 'google-service-account',
    displayName: 'BigQuery Service Account',
    description: '',
    category: 'other',
    auth: { type: 'google-service-account', label: 'Service account key (JSON)' },
    origins: ['https://*.googleapis.com'],
  },
  aiModelMappings: null,
};

const DOC_URL = 'https://docs.googleapis.com/v1/documents/d1:batchUpdate';
const DOCS_SCOPE = 'https://www.googleapis.com/auth/documents';
const googleTokens = { getAccessToken: jest.fn(), drop: jest.fn() };
const credentials = { markRejected: jest.fn() };
const service = () => new CredentialFetchService(googleTokens as never, credentials as never);

describe('CredentialFetchService', () => {
  beforeEach(() => {
    googleTokens.getAccessToken.mockReset().mockResolvedValue('google-access-token');
    googleTokens.drop.mockReset();
    credentials.markRejected.mockReset().mockResolvedValue(undefined);
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

    const response = await service().run(binding, {
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

  it('answers 400 for a definition without origins without reaching the network', async () => {
    const fetchMock = global.fetch as jest.Mock;
    const { origins: _origins, ...withoutOrigins } = binding.definition;

    await expect(
      service().run(
        { ...binding, definition: { ...withoutOrigins, category: 'snowflake' } },
        { url: 'https://api.github.com/user', method: 'GET' }
      )
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an origin that is not declared without reaching the network', async () => {
    const fetchMock = global.fetch as jest.Mock;

    await expect(
      service().run(binding, {
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

    await service().run(binding, {
      url: 'https://api.github.com/resource',
      method: 'PROPFIND',
    });

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'PROPFIND' });
  });

  it.each(['bad name', 'bad:name'])(
    'rejects invalid request header name %s as a 400',
    async name => {
      await expect(
        service().run(binding, {
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
      service().run(binding, {
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

    await service().run(binding, {
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

  it('answers a 400 when the response body is larger than the limit', async () => {
    const fetchService = service();
    // runRaw already bounds the stream; this feeds run() an unbounded body to pin its own check.
    jest
      .spyOn(fetchService, 'runRaw')
      .mockResolvedValue(new Response('0123456789', { status: 200 }));

    await expect(
      fetchService.run(
        binding,
        { url: 'https://api.github.com/big', method: 'GET' },
        { maxResponseBodyBytes: 4 }
      )
    ).rejects.toThrow(new BadRequestException('Credential response body is too large'));
  });

  it.each([
    'https://docs.googleapis.com/v1/documents/d1',
    'https://a.b.googleapis.com/v1/x',
    'https://DOCS.GOOGLEAPIS.COM/v1/documents/d1',
  ])('lets a BigQuery Service Account reach %s', async url => {
    (global.fetch as jest.Mock).mockResolvedValue(new Response('{}', { status: 200 }));

    await service().run(googleBinding, { url, method: 'GET' });

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    'https://googleapis.com/v1/x',
    'https://evilgoogleapis.com/v1/x',
    'https://docs.googleapis.com:8443/v1/x',
    'https://docs.googleapis.com.evil.example/v1/x',
    'http://docs.googleapis.com/v1/x',
    'https://api.github.com/user',
  ])('refuses a BigQuery Service Account request to %s', async url => {
    await expect(service().run(googleBinding, { url, method: 'GET' })).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('keeps a wildcard origin literal for a header definition', async () => {
    const wildcardHeader: ResolvedCredentialBinding = {
      ...binding,
      definition: { ...binding.definition, origins: ['https://*.example.com'] },
    };

    await expect(
      service().run(wildcardHeader, {
        url: 'https://a.example.com/x',
        method: 'GET',
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('replaces the plugin authorization with a token for the declared scopes', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(new Response('{}', { status: 200 }));

    await service().run(googleBinding, {
      url: DOC_URL,
      method: 'GET',
      headers: { Authorization: 'Bearer plugin-supplied', accept: 'application/json' },
    });

    const headers = (global.fetch as jest.Mock).mock.calls[0][1].headers as Headers;
    expect(headers.get('authorization')).toBe('Bearer google-access-token');
    expect(headers.get('accept')).toBe('application/json');
    expect(googleTokens.getAccessToken).toHaveBeenCalledWith({
      credentialId: 'credential-2',
      secret: googleBinding.secret,
      scopes: [DOCS_SCOPE],
      signal: expect.any(AbortSignal),
    });
  });

  it('retries a 401 once with a fresh token and the same body', async () => {
    googleTokens.getAccessToken.mockResolvedValueOnce('stale').mockResolvedValueOnce('fresh');
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));

    const response = await service().run(googleBinding, {
      url: DOC_URL,
      method: 'POST',
      bodyBase64: Buffer.from('{"requests":[]}').toString('base64'),
    });

    expect(response.status).toBe(200);
    expect(googleTokens.drop).toHaveBeenCalledWith(
      { credentialId: 'credential-2', secret: googleBinding.secret, scopes: [DOCS_SCOPE] },
      'stale'
    );
    const sent = (global.fetch as jest.Mock).mock.calls.map(([url, init]) => ({
      url,
      authorization: (init.headers as Headers).get('authorization'),
      body: Buffer.from(init.body as ArrayBuffer).toString(),
    }));
    expect(sent).toEqual([
      { url: DOC_URL, authorization: 'Bearer stale', body: '{"requests":[]}' },
      { url: DOC_URL, authorization: 'Bearer fresh', body: '{"requests":[]}' },
    ]);
  });

  it('follows a Google redirect to another Google host with the same authorization', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://sheets.googleapis.com/x' },
        })
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    await service().run(googleBinding, { url: DOC_URL, method: 'GET' });

    const calls = (global.fetch as jest.Mock).mock.calls;
    expect(calls[1][0]).toBe('https://sheets.googleapis.com/x');
    expect((calls[1][1].headers as Headers).get('authorization')).toBe(
      'Bearer google-access-token'
    );
  });

  it('refuses a Google redirect to a lookalike host', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: 'https://docs.googleapis.com.evil.example/x' },
      })
    );

    await expect(
      service().run(googleBinding, { url: DOC_URL, method: 'GET' })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('answers CREDENTIAL_SCOPE_INVALID without minting when the requirement has no scopes', async () => {
    const noScopes = {
      ...googleBinding,
      requirement: { ...googleBinding.requirement, scopes: [] },
    };

    const error = await service()
      .run(noScopes, { url: DOC_URL, method: 'GET' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'CREDENTIAL_SCOPE_INVALID',
    });
    expect(googleTokens.getAccessToken).not.toHaveBeenCalled();
  });

  it('returns a second 401 to the plugin', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{}', { status: 401 }));

    const response = await service().run(googleBinding, { url: DOC_URL, method: 'GET' });

    expect(response.status).toBe(401);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 401 for a header definition', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(new Response('{}', { status: 401 }));

    await service().run(binding, { url: 'https://api.github.com/user', method: 'GET' });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(googleTokens.getAccessToken).not.toHaveBeenCalled();
  });

  it('marks the Credential rejected and answers CREDENTIAL_REJECTED when Google refuses the key', async () => {
    googleTokens.getAccessToken.mockRejectedValue(
      new GoogleTokenError('rejected', 'invalid_grant: Invalid JWT Signature.')
    );

    const error = await service()
      .run(googleBinding, { url: DOC_URL, method: 'GET' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toEqual({
      code: 'CREDENTIAL_REJECTED',
      message: 'Google rejected the service account key: invalid_grant: Invalid JWT Signature.',
    });
    expect(credentials.markRejected).toHaveBeenCalledWith(
      'credential-2',
      googleBinding.secret,
      'invalid_grant: Invalid JWT Signature.'
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('marks the Credential rejected when Google refuses the key on the retry after a 401', async () => {
    googleTokens.getAccessToken
      .mockResolvedValueOnce('stale')
      .mockRejectedValueOnce(
        new GoogleTokenError('rejected', 'disabled_client: The client is disabled.')
      );
    (global.fetch as jest.Mock).mockResolvedValueOnce(new Response('{}', { status: 401 }));

    await expect(
      service().run(googleBinding, { url: DOC_URL, method: 'GET' })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(credentials.markRejected).toHaveBeenCalledWith(
      'credential-2',
      googleBinding.secret,
      'disabled_client: The client is disabled.'
    );
  });

  it('answers CREDENTIAL_SCOPE_INVALID and leaves the Credential state alone', async () => {
    googleTokens.getAccessToken.mockRejectedValue(
      new GoogleTokenError('scope', 'Google issued no access token')
    );

    const error = await service()
      .run(googleBinding, { url: DOC_URL, method: 'GET' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual({
      code: 'CREDENTIAL_SCOPE_INVALID',
      message: 'Google issued no access token for the scopes this plugin declares',
    });
    expect(credentials.markRejected).not.toHaveBeenCalled();
  });

  it('answers 502 when Google cannot be reached', async () => {
    googleTokens.getAccessToken.mockRejectedValue(
      new GoogleTokenError('unavailable', 'Google could not be reached')
    );

    await expect(service().run(googleBinding, { url: DOC_URL, method: 'GET' })).rejects.toThrow(
      new BadGatewayException('Credential request could not be completed')
    );
    expect(credentials.markRejected).not.toHaveBeenCalled();
  });
});
