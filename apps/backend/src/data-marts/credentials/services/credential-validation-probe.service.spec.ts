import type { ResolvedCredentialDefinition } from '../dto/credential-api.dto';
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
  const service = new CredentialValidationProbeService(fetch);

  beforeEach(() => jest.clearAllMocks());

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
