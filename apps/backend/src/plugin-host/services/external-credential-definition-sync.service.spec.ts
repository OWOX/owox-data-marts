import { BadRequestException } from '@nestjs/common';
import { GithubAccessMode } from '../enums/github-access-mode.enum';
import { GithubReadPolicy } from '../enums/github-read-policy.enum';
import {
  GithubApiError,
  GithubRateLimitedError,
  GithubRepoNotAccessibleError,
  GithubRepoNotFoundError,
  InvalidRepoLocatorError,
} from '../errors/plugin-host.errors';
import {
  ExternalCredentialDefinitionSyncService,
  ExternalCredentialRequirementError,
} from './external-credential-definition-sync.service';

const repo = {
  githubRepoId: '123',
  owner: 'acme',
  name: 'credentials',
  isPrivate: false,
};
const release = {
  githubReleaseId: 'release-1',
  tagName: 'v1.0.0',
  isDraft: false,
  isPrerelease: false,
  publishedAt: new Date(),
};
const manifest = JSON.stringify({
  name: 'Acme Credentials',
  description: '',
  delivery: { type: 'credential-definition' },
  credential: {
    name: 'acme',
    documentationUrl: 'https://docs.acme.example/api-keys',
    authentication: {
      type: 'secret',
      label: 'API key',
      placement: { type: 'header', name: 'authorization', scheme: 'Bearer' },
    },
    origins: ['https://api.acme.example'],
  },
});

function setup() {
  const github = {
    getRepo: jest.fn().mockResolvedValue(repo),
    listReleases: jest.fn().mockResolvedValue([release]),
    resolveCommitSha: jest.fn().mockResolvedValue('a'.repeat(40)),
    getFileAtCommit: jest.fn().mockResolvedValue(manifest),
  };
  const registry = {
    register: jest.fn().mockResolvedValue({
      definitionId: 'definition-1',
      source: 'external',
      compatibilityLine: '1',
      contract: {
        id: 'acme',
        displayName: 'Acme Credentials',
        description: '',
        auth: { type: 'header', label: 'API key', headerName: 'authorization', prefix: 'Bearer ' },
        origins: ['https://api.acme.example'],
      },
    }),
    preview: jest.fn().mockResolvedValue({ contract: { id: 'acme' } }),
    getCurrentByGithubRepoId: jest.fn().mockResolvedValue(null),
  };
  return {
    service: new ExternalCredentialDefinitionSyncService(github as never, registry as never),
    github,
    registry,
  };
}

describe('ExternalCredentialDefinitionSyncService', () => {
  it('resolves @owner/repository and stores immutable release identity', async () => {
    const state = setup();

    await expect(state.service.syncLocator('@acme/credentials')).resolves.toMatchObject({
      definitionId: 'definition-1',
    });
    expect(state.github.getRepo).toHaveBeenCalledWith(
      { owner: 'acme', name: 'credentials' },
      GithubReadPolicy.CONFIGURED
    );
    expect(state.github.listReleases).toHaveBeenCalledWith(
      { owner: 'acme', name: 'credentials' },
      GithubReadPolicy.CONFIGURED
    );
    expect(state.github.resolveCommitSha).toHaveBeenCalledWith(
      { owner: 'acme', name: 'credentials' },
      'v1.0.0',
      GithubReadPolicy.CONFIGURED
    );
    expect(state.github.getFileAtCommit).toHaveBeenCalledWith(
      { owner: 'acme', name: 'credentials' },
      'plugin.json',
      'a'.repeat(40),
      GithubReadPolicy.CONFIGURED
    );
    expect(state.registry.register).toHaveBeenCalledWith(
      expect.objectContaining({
        githubRepoId: '123',
        semver: '1.0.0',
        commitSha: 'a'.repeat(40),
        githubReleaseId: 'release-1',
        contract: expect.objectContaining({
          documentationUrl: 'https://docs.acme.example/api-keys',
        }),
      })
    );
  });

  it('replaces a locator with stable definition identity and the declared runtime name', async () => {
    const state = setup();

    await expect(
      state.service.resolveRequirements(['github', '@acme/credentials'])
    ).resolves.toEqual([
      'github',
      {
        id: 'acme',
        definitionId: 'definition-1',
        optional: false,
        models: undefined,
      },
    ]);
  });

  it('syncs private repositories through configured GitHub access', async () => {
    const state = setup();
    state.github.getRepo.mockResolvedValue({
      ...repo,
      isPrivate: true,
      accessMode: GithubAccessMode.APP,
    });

    await expect(state.service.syncLocator('@acme/credentials')).resolves.toMatchObject({
      definitionId: 'definition-1',
    });
    expect(state.github.getRepo).toHaveBeenCalledWith(
      { owner: 'acme', name: 'credentials' },
      GithubReadPolicy.CONFIGURED
    );
    expect(state.github.listReleases).toHaveBeenCalledWith(
      { owner: 'acme', name: 'credentials' },
      GithubReadPolicy.CONFIGURED
    );
    expect(state.github.getFileAtCommit).toHaveBeenCalledWith(
      { owner: 'acme', name: 'credentials' },
      'plugin.json',
      'a'.repeat(40),
      GithubReadPolicy.CONFIGURED
    );
  });

  it('previews requirements under the same rules without registering them', async () => {
    const state = setup();

    await expect(
      state.service.previewRequirements(['github', '@acme/credentials'])
    ).resolves.toBeUndefined();
    expect(state.registry.preview).toHaveBeenCalledWith(
      expect.objectContaining({
        githubRepoId: '123',
        semver: '1.0.0',
        githubReleaseId: 'release-1',
      })
    );
    await expect(state.service.previewRequirements(['stripe'])).rejects.toThrow(
      'Unknown Credential requirement "stripe"'
    );
    await expect(
      state.service.previewRequirements(['@acme/first', '@acme/second'])
    ).rejects.toThrow('Duplicate resolved Credential handle acme');
    expect(state.registry.register).not.toHaveBeenCalled();
  });

  it('previews external requirements with distinct handles', async () => {
    const state = setup();
    state.registry.preview
      .mockResolvedValueOnce({ contract: { id: 'first' } })
      .mockResolvedValueOnce({ contract: { id: 'second' } });

    await expect(
      state.service.previewRequirements(['@acme/first', '@acme/second'])
    ).resolves.toBeUndefined();
    expect(state.registry.preview).toHaveBeenCalledTimes(2);
  });

  it('previews a definition the registry rejects as the requirement error resolving raises', async () => {
    const state = setup();
    const rejection = new BadRequestException(
      'Credential definition contains a non-public network target'
    );
    state.registry.preview.mockRejectedValue(rejection);
    state.registry.register.mockRejectedValue(rejection);
    const message = '1.0.0: Credential definition contains a non-public network target';

    const attempt = state.service.previewRequirements(['@acme/credentials']);

    await expect(attempt).rejects.toBeInstanceOf(ExternalCredentialRequirementError);
    await expect(attempt).rejects.toThrow(message);
    await expect(state.service.resolveRequirements(['@acme/credentials'])).rejects.toThrow(message);
  });

  it('previews built-in and external requirements together, reading GitHub only for the external one', async () => {
    const state = setup();

    await expect(
      state.service.previewRequirements([
        'ai',
        'github',
        { id: '@acme/credentials', optional: true },
      ])
    ).resolves.toBeUndefined();
    expect(state.github.getRepo).toHaveBeenCalledTimes(1);
    expect(state.registry.preview).toHaveBeenCalledTimes(1);
  });

  describe('a Credential repository it cannot read', () => {
    it('previews an invalid locator as a requirement error naming it', async () => {
      const state = setup();

      const attempt = state.service.previewRequirements(['@acme']);

      await expect(attempt).rejects.toBeInstanceOf(ExternalCredentialRequirementError);
      await expect(attempt).rejects.toThrow(
        '@acme: Expected a GitHub repository, for example https://github.com/owner/name or owner/name'
      );
      await expect(state.service.resolveRequirements(['@acme'])).rejects.toBeInstanceOf(
        InvalidRepoLocatorError
      );
    });

    it.each([
      ['not found', new GithubRepoNotFoundError('acme', 'credentials')],
      [
        'not accessible',
        new GithubRepoNotAccessibleError('acme', 'credentials', 'https://github.com/apps/owox'),
      ],
    ])('previews a repository GitHub reports %s as a requirement error', async (_case, error) => {
      const state = setup();
      state.github.getRepo.mockRejectedValue(error);

      const attempt = state.service.previewRequirements(['@acme/credentials']);

      await expect(attempt).rejects.toBeInstanceOf(ExternalCredentialRequirementError);
      await expect(attempt).rejects.toThrow(`@acme/credentials: ${error.message}`);
      await expect(state.service.resolveRequirements(['@acme/credentials'])).rejects.toBe(error);
    });

    it('keeps the installation URL of an inaccessible repository in the requirement error', async () => {
      const state = setup();
      state.github.getRepo.mockRejectedValue(
        new GithubRepoNotAccessibleError('acme', 'credentials', 'https://github.com/apps/owox')
      );

      await expect(state.service.previewRequirements(['@acme/credentials'])).rejects.toThrow(
        /^@acme\/credentials: .* https:\/\/github\.com\/apps\/owox$/
      );
    });

    it('ends a not-found requirement error at the message', async () => {
      const state = setup();
      const error = new GithubRepoNotFoundError('acme', 'credentials');
      state.github.getRepo.mockRejectedValue(error);

      await expect(state.service.previewRequirements(['@acme/credentials'])).rejects.toThrow(
        new ExternalCredentialRequirementError(`@acme/credentials: ${error.message}`)
      );
    });

    it.each([
      ['an API error', new GithubApiError(502, '/repos/acme/credentials')],
      ['a rate limit', new GithubRateLimitedError('2026-10-09T12:00:00Z', 'anonymous')],
    ])('still throws %s from a preview', async (_case, error) => {
      const state = setup();
      state.github.getRepo.mockRejectedValue(error);

      await expect(state.service.previewRequirements(['@acme/credentials'])).rejects.toBe(error);
    });
  });

  it('rejects an exact requirement that is neither built-in nor a GitHub locator', async () => {
    const state = setup();

    await expect(state.service.resolveRequirements(['stripe'])).rejects.toThrow(
      'Unknown Credential requirement "stripe"'
    );
    expect(state.github.getRepo).not.toHaveBeenCalled();
  });

  it('rejects duplicate resolved runtime handles', async () => {
    const state = setup();
    await expect(
      state.service.resolveRequirements(['@acme/first', '@acme/second'])
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('surfaces a rejected newer release instead of silently falling back', async () => {
    const state = setup();
    state.github.listReleases.mockResolvedValue([
      { ...release, githubReleaseId: 'release-2', tagName: 'v1.1.0' },
      release,
    ]);
    state.registry.register.mockRejectedValueOnce(
      new BadRequestException(
        'Credential definition 1.1.0 changes an incompatible contract; publish a new compatibility line'
      )
    );

    await expect(state.service.syncLocator('@acme/credentials')).rejects.toThrow(
      'publish a new compatibility line'
    );
    expect(state.registry.register).toHaveBeenCalledTimes(1);
  });

  it('propagates transient GitHub failures instead of calling them manifest errors', async () => {
    const state = setup();
    const transient = new Error('GitHub unavailable');
    state.github.getRepo.mockRejectedValue(transient);

    await expect(state.service.resolveRequirements(['@acme/credentials'])).rejects.toBe(transient);
    expect(state.registry.register).not.toHaveBeenCalled();
  });
});
