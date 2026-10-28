import { CredentialsExpiredException } from '../../exceptions/google-oauth.exceptions';
import type { ResolvedCredentialDefinition } from '../dto/credential-api.dto';
import { BUILTIN_CREDENTIAL_DEFINITIONS } from './builtin-credential-definitions';
import { CredentialFetchService } from './credential-fetch.service';
import { CredentialValidationProbeService } from './credential-validation-probe.service';

const definition: ResolvedCredentialDefinition = {
  definitionId: 'github',
  source: 'builtin',
  compatibilityLine: null,
  contract: {
    id: 'github',
    displayName: 'GitHub',
    description: '',
    category: 'other',
    origins: ['https://api.github.com'],
    auth: { type: 'header', label: 'API key', headerName: 'authorization', prefix: 'Bearer ' },
    validation: {
      method: 'GET',
      path: '/user',
      successStatuses: [200],
      rejectedStatuses: [401, 403],
    },
  },
};

describe('CredentialValidationProbeService', () => {
  const fetch = { run: jest.fn() } as unknown as CredentialFetchService;
  const googleTokens = { verify: jest.fn() };
  const googleOAuth = { getOAuth2Client: jest.fn() };
  const service = new CredentialValidationProbeService(
    fetch,
    googleTokens as never,
    googleOAuth as never
  );

  beforeEach(() => jest.clearAllMocks());

  describe('for a Google account', () => {
    const googleAccount = {
      definitionId: 'google-oauth',
      source: 'builtin',
      compatibilityLine: null,
      contract: BUILTIN_CREDENTIAL_DEFINITIONS.find(
        definition => definition.id === 'google-oauth'
      )!,
    } as const;
    const secret = {
      oauth: {
        provider: 'google',
        clientId: 'storage-client-id',
        tokens: { access_token: 'a', token_type: 'Bearer', scope: '' },
      },
    } as const;

    it('verifies the grant by refreshing it', async () => {
      googleOAuth.getOAuth2Client.mockResolvedValue({ client: {}, clientId: 'storage-client-id' });

      await expect(service.run(googleAccount, secret, 'credential-1')).resolves.toMatchObject({
        state: 'verified',
      });
      expect(googleOAuth.getOAuth2Client).toHaveBeenCalledWith('credential-1', {
        forceRefresh: true,
      });
      expect(fetch.run).not.toHaveBeenCalled();
    });

    it('reports an expired or revoked grant as rejected', async () => {
      googleOAuth.getOAuth2Client.mockRejectedValue(
        new CredentialsExpiredException('credential-1', 'credential')
      );

      await expect(service.run(googleAccount, secret, 'credential-1')).resolves.toMatchObject({
        state: 'rejected',
        message: 'Google authorization expired or was revoked. Reconnect this Credential.',
      });
    });

    it('reports other failures as unknown', async () => {
      googleOAuth.getOAuth2Client.mockRejectedValue(new Error('socket hang up'));

      await expect(service.run(googleAccount, secret, 'credential-1')).resolves.toMatchObject({
        state: 'unknown',
      });
    });
  });

  it('asks Google for a token instead of running a fetch probe for a service account key', async () => {
    googleTokens.verify.mockResolvedValue({
      state: 'verified',
      message: 'Google issued a token for this key',
      validatedAt: new Date(),
    });

    await expect(
      service.run(
        {
          definitionId: 'google-service-account',
          source: 'builtin',
          compatibilityLine: null,
          contract: {
            id: 'google-service-account',
            displayName: 'BigQuery Service Account',
            description: '',
            category: 'other',
            origins: ['https://*.googleapis.com'],
            auth: { type: 'google-service-account', label: 'Service account key (JSON)' },
          },
        },
        { value: 'key-json' }
      )
    ).resolves.toMatchObject({ state: 'verified' });
    expect(googleTokens.verify).toHaveBeenCalledWith({ value: 'key-json' });
    expect(fetch.run).not.toHaveBeenCalled();
  });

  it('returns unknown without fetching for a definition without origins or validation', async () => {
    await expect(
      service.run(
        {
          definitionId: 'snowflake',
          source: 'builtin',
          compatibilityLine: null,
          contract: {
            id: 'snowflake',
            displayName: 'Snowflake',
            description: '',
            category: 'snowflake',
            auth: { type: 'fields', fields: [] },
          },
        },
        { fields: { password: 'x' } }
      )
    ).resolves.toMatchObject({ state: 'unknown' });
    expect(fetch.run).not.toHaveBeenCalled();
  });

  it('returns verified for an accepted fixed probe without exposing the secret', async () => {
    jest.mocked(fetch.run).mockResolvedValue({ status: 200, headers: {}, bodyBase64: '' });

    const result = await service.run(definition, { value: 'provider-secret' });

    expect(result.state).toBe('verified');
    expect(fetch.run).toHaveBeenCalledWith(
      expect.objectContaining({ secret: { value: 'provider-secret' } }),
      expect.objectContaining({ url: 'https://api.github.com/user', method: 'GET' }),
      { timeoutMs: 10_000, maxResponseBodyBytes: 65_536 }
    );
    expect(JSON.stringify(result)).not.toContain('provider-secret');
  });

  it('returns rejected only for a declared authentication rejection status', async () => {
    jest.mocked(fetch.run).mockResolvedValue({ status: 401, headers: {}, bodyBase64: '' });

    await expect(service.run(definition, { value: 'invalid' })).resolves.toMatchObject({
      state: 'rejected',
    });
  });

  it('returns unknown for provider and network outcomes that do not prove validity', async () => {
    jest.mocked(fetch.run).mockResolvedValueOnce({ status: 500, headers: {}, bodyBase64: '' });
    await expect(service.run(definition, { value: 'maybe' })).resolves.toMatchObject({
      state: 'unknown',
    });

    jest.mocked(fetch.run).mockRejectedValueOnce(new Error('timeout'));
    await expect(service.run(definition, { value: 'maybe' })).resolves.toMatchObject({
      state: 'unknown',
    });
  });
});
