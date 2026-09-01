import { BadRequestException } from '@nestjs/common';
import { GithubReadPolicy } from '../enums/github-read-policy.enum';
import { ExternalCredentialDefinitionSyncService } from './external-credential-definition-sync.service';

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
      GithubReadPolicy.PUBLIC_ONLY
    );
    expect(state.github.listReleases).toHaveBeenCalledWith(
      { owner: 'acme', name: 'credentials' },
      GithubReadPolicy.PUBLIC_ONLY
    );
    expect(state.github.resolveCommitSha).toHaveBeenCalledWith(
      { owner: 'acme', name: 'credentials' },
      'v1.0.0',
      GithubReadPolicy.PUBLIC_ONLY
    );
    expect(state.github.getFileAtCommit).toHaveBeenCalledWith(
      { owner: 'acme', name: 'credentials' },
      'plugin.json',
      'a'.repeat(40),
      GithubReadPolicy.PUBLIC_ONLY
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

  it('rejects private repositories before reading their releases or manifest', async () => {
    const state = setup();
    state.github.getRepo.mockResolvedValue({ ...repo, isPrivate: true });

    await expect(state.service.syncLocator('@acme/credentials')).rejects.toThrow(
      'Private GitHub repositories are not supported'
    );
    expect(state.github.listReleases).not.toHaveBeenCalled();
    expect(state.github.getFileAtCommit).not.toHaveBeenCalled();
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
});
