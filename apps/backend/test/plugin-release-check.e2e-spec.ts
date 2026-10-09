import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createTestApp } from '@owox/test-utils';
import { CredentialDefinitionVersion } from 'src/data-marts/credentials/entities/credential-definition-version.entity';
import { CredentialExternalDefinition } from 'src/data-marts/credentials/entities/credential-external-definition.entity';
import { IdpProviderService } from 'src/idp/services/idp-provider.service';
import { PluginVersion } from 'src/plugin-host/entities/plugin-version.entity';
import { Plugin } from 'src/plugin-host/entities/plugin.entity';
import { PluginPublicationScope } from 'src/plugin-host/enums/plugin-publication-scope.enum';
import { GithubApiService } from 'src/plugin-host/services/github-api.service';
import { RemoteUrlValidatorService } from 'src/plugin-host/services/remote-url-validator.service';
import { PluginPublicationService } from 'src/plugin-host/services/plugin-publication.service';
import * as supertest from 'supertest';
import { Repository } from 'typeorm';

const PUBLISHER_KEY = 'publisher-key';
const COMMIT = 'c'.repeat(40);
const CREDENTIAL_REPO = { githubRepoId: 'credential-repo-1', owner: 'acme', name: 'credentials' };

const credentialManifest = JSON.stringify({
  name: 'Acme Credentials',
  description: '',
  delivery: { type: 'credential-definition' },
  credential: {
    name: 'acme',
    authentication: {
      type: 'secret',
      label: 'API key',
      placement: { type: 'header', name: 'authorization', scheme: 'Bearer' },
    },
    // An IP literal keeps the public-network check off DNS.
    origins: ['https://8.8.8.8'],
  },
});

const pluginManifest = JSON.stringify({
  name: 'Release Check',
  description: 'Release check e2e',
  delivery: { type: 'remote', url: 'https://plugin.example.com' },
  collections: [{ name: 'settings', scope: 'member' }],
  credentials: ['@acme/credentials'],
});

describe('Plugin release check (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let plugins: Repository<Plugin>;
  let versions: Repository<PluginVersion>;
  let definitions: Repository<CredentialExternalDefinition>;
  let definitionVersions: Repository<CredentialDefinitionVersion>;
  let publications: PluginPublicationService;
  const pluginRepoIds = new Map<string, string>();
  let counter = 0;

  const payloads: Record<string, object> = {
    publisher: {
      userId: 'publisher-user',
      projectId: 'project-1',
      roles: ['viewer'],
      authFlow: 'api_key',
      apiKeyId: PUBLISHER_KEY,
    },
    viewer: { userId: 'viewer-1', projectId: 'project-1', roles: ['viewer'], authFlow: 'app_owox' },
    manager: {
      userId: 'manager-1',
      projectId: 'project-1',
      roles: ['viewer'],
      authFlow: 'app_owox',
    },
  };

  beforeAll(async () => {
    process.env.OWOX_DEPLOYMENT_PLUGIN_PUBLISHER_API_KEY_IDS = PUBLISHER_KEY;
    const testApp = await createTestApp([
      {
        provide: IdpProviderService,
        useValue: {
          getProvider: () => ({ introspectToken: async (token: string) => payloads[token] }),
        },
      },
    ]);
    app = testApp.app;
    agent = testApp.agent;

    plugins = app.get(getRepositoryToken(Plugin));
    versions = app.get(getRepositoryToken(PluginVersion));
    definitions = app.get(getRepositoryToken(CredentialExternalDefinition));
    definitionVersions = app.get(getRepositoryToken(CredentialDefinitionVersion));
    publications = app.get(PluginPublicationService);

    const github = app.get(GithubApiService);
    jest.spyOn(github, 'getRepo').mockImplementation(async ref => {
      const key = `${ref.owner}/${ref.name}`;
      if (key === 'acme/credentials') return CREDENTIAL_REPO as never;
      return { githubRepoId: pluginRepoIds.get(key) } as never;
    });
    jest.spyOn(github, 'resolveCommitSha').mockResolvedValue(COMMIT);
    jest.spyOn(github, 'listReleases').mockResolvedValue([
      {
        githubReleaseId: 'credential-release-1',
        tagName: 'v1.0.0',
        isDraft: false,
        isPrerelease: false,
        publishedAt: new Date(),
      },
    ] as never);
    jest
      .spyOn(github, 'getFileAtCommit')
      .mockImplementation(async ref =>
        ref.owner === 'acme' ? credentialManifest : pluginManifest
      );
    jest
      .spyOn(app.get(RemoteUrlValidatorService), 'validate')
      .mockResolvedValue({ ok: true } as never);
  }, 60_000);

  afterAll(async () => app?.close());

  async function seedPlugin(): Promise<Plugin> {
    const name = `release-check-${++counter}`;
    const plugin = await plugins.save(
      plugins.create({
        githubRepoId: `repo-${counter}`,
        repoOwner: 'OWOX',
        repoName: name,
        repoHtmlUrl: `https://github.com/OWOX/${name}`,
      })
    );
    pluginRepoIds.set(`OWOX/${name}`, plugin.githubRepoId);
    const version = await versions.save(
      versions.create({
        pluginId: plugin.id,
        semver: '1.0.0',
        commitSha: 'a'.repeat(40),
        githubReleaseId: `release-${counter}`,
        tagName: 'v1.0.0',
        displayName: name,
        description: name,
        deliveryType: 'remote',
        deliveryUrl: 'https://plugin.example.com',
        releasePublishedAt: new Date(),
        collections: [{ name: 'settings', scope: 'member' }],
      })
    );
    await plugins.update(plugin.id, { currentVersionId: version.id });
    return plugin;
  }

  const check = (plugin: Plugin, caller: string) =>
    agent
      .post('/api/plugins/check')
      .set('x-owox-authorization', caller)
      .set('x-owox-api-key-id', PUBLISHER_KEY)
      .send({ repository: `${plugin.repoOwner}/${plugin.repoName}`, ref: 'main' });

  it('reports a clean candidate to a deployment publisher and records nothing', async () => {
    const plugin = await seedPlugin();
    const counts = async () => [
      await plugins.count(),
      await versions.count(),
      await definitions.count(),
      await definitionVersions.count(),
    ];
    const before = await counts();
    (app.get(GithubApiService).getFileAtCommit as jest.Mock).mockClear();

    const response = await check(plugin, 'publisher').expect(200);

    expect(response.body).toEqual({
      pluginId: plugin.id,
      repository: `OWOX/${plugin.repoName}`,
      commitSha: COMMIT,
      candidateVersion: '1.1.0',
      baselineVersion: '1.0.0',
      collectionsEvaluated: true,
      issues: [],
    });
    expect(await counts()).toEqual(before);
    expect(manifestReadFor('acme/credentials')).toBe(true);
  });

  it('answers 404 to a member who manages no publication of the plugin', async () => {
    const plugin = await seedPlugin();

    await check(plugin, 'viewer').expect(404);
  });

  it('lets a member who manages a publication of the plugin check it', async () => {
    const plugin = await seedPlugin();
    await publications.create({
      pluginId: plugin.id,
      scope: PluginPublicationScope.MEMBER,
      uniquenessKey: `member:${plugin.id}:project-1:manager-1`,
      projectId: 'project-1',
      userId: 'manager-1',
      allProjects: false,
    });

    const response = await check(plugin, 'manager').expect(200);

    expect(response.body).toMatchObject({ pluginId: plugin.id, issues: [] });
  });

  it('refuses a second check of the same plugin by the same caller', async () => {
    const plugin = await seedPlugin();
    await check(plugin, 'publisher').expect(200);

    const second = await check(plugin, 'publisher');

    expect(second.status).toBe(400);
    expect(second.body).toMatchObject({ code: 'PLUGIN_CHECK_RATE_LIMITED' });
  });

  function manifestReadFor(repo: string): boolean {
    const github = app.get(GithubApiService);
    return (github.getFileAtCommit as jest.Mock).mock.calls.some(
      ([ref]) => `${ref.owner}/${ref.name}` === repo
    );
  }
});
