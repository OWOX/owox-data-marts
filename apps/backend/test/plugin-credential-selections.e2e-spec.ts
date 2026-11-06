import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as supertest from 'supertest';
import { closeTestApp, createTestApp } from '@owox/test-utils';
import { normalizeCredentialRequirement } from '../src/data-marts/credentials/credential.types';
import { CredentialConsumerBinding } from '../src/data-marts/credentials/entities/credential-consumer-binding.entity';
import { requirementRevision } from '../src/data-marts/credentials/services/credential-requirement-revision';
import { PLUGIN_RUNTIME_AUTHORIZER } from '../src/idp/ports/plugin-runtime-authorizer.port';
import { IdpProviderService } from '../src/idp/services/idp-provider.service';
import { InstallPluginCommand } from '../src/plugin-host/dto/domain/install-plugin.command';
import { UninstallPluginCommand } from '../src/plugin-host/dto/domain/uninstall-plugin.command';
import { PluginVersion } from '../src/plugin-host/entities/plugin-version.entity';
import { Plugin } from '../src/plugin-host/entities/plugin.entity';
import { InstallPluginService } from '../src/plugin-host/use-cases/install-plugin.service';
import { UninstallPluginService } from '../src/plugin-host/use-cases/uninstall-plugin.service';
import { Repository } from 'typeorm';
import { createCredential } from './fixtures/storage-credentials';

const ALICE_TOKEN = 'alice-token';
const BOB_TOKEN = 'bob-token';
const PLUGIN_TOKEN = 'plugin-token';
const ALICE = { projectId: 'project-1', userId: 'alice' };

/**
 * Which Credential each requirement is granted, over real HTTP against the real guard.
 *
 * A plugin's runtime token carries the member's own authority, so only @RejectPluginAuth
 * keeps a plugin from reading which Credential ids it is bound to -- and that decorator is
 * worth something only if the guard @Auth attaches actually refuses the request.
 */
describe('Plugin installation Credential selections over HTTP (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let bindings: Repository<CredentialConsumerBinding>;
  let installationId: string;
  let credentialId: string;
  let uninstall: () => Promise<unknown>;

  // Resolves for every installation: a refusal must come from the endpoint declining plugin
  // authority, not from the installation looking inactive to the runtime check.
  const assertActiveInstallation = jest.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    // An unknown token, the empty one included, identifies nobody, as with a real provider.
    const payload = (token: string) =>
      [ALICE_TOKEN, BOB_TOKEN, PLUGIN_TOKEN].includes(token)
        ? {
            userId: token === BOB_TOKEN ? 'bob' : 'alice',
            projectId: 'project-1',
            roles: ['viewer'],
            ...(token === PLUGIN_TOKEN
              ? { authFlow: 'plugin', pluginId: 'plugin-under-test', installationId }
              : { authFlow: 'app_owox' }),
          }
        : null;
    const testApp = await createTestApp([
      {
        provide: IdpProviderService,
        useValue: {
          getProvider: () => ({
            introspectToken: async (token: string) => payload(token),
            parseToken: async (token: string) => payload(token),
          }),
        },
      },
      { provide: PLUGIN_RUNTIME_AUTHORIZER, useValue: { assertActiveInstallation } },
    ]);
    app = testApp.app;
    agent = testApp.agent;
    bindings = app.get(getRepositoryToken(CredentialConsumerBinding));

    const plugins: Repository<Plugin> = app.get(getRepositoryToken(Plugin));
    const versions: Repository<PluginVersion> = app.get(getRepositoryToken(PluginVersion));
    const plugin = await plugins.save(
      plugins.create({
        githubRepoId: '123456789',
        repoOwner: 'OWOX',
        repoName: 'selections-plugin',
        repoHtmlUrl: 'https://github.com/OWOX/selections-plugin',
      })
    );
    const version = await versions.save(
      versions.create({
        pluginId: plugin.id,
        semver: '1.0.0',
        commitSha: 'abc123',
        githubReleaseId: '7',
        tagName: 'v1.0.0',
        displayName: 'Selections Plugin',
        description: 'Uses an AI Credential',
        deliveryType: 'remote',
        deliveryUrl: 'https://plugin.example.com',
        releasePublishedAt: null,
      })
    );
    await plugins.update(plugin.id, { currentVersionId: version.id });

    installationId = (
      await app
        .get(InstallPluginService)
        .run(new InstallPluginCommand(plugin.id, version.id, ALICE))
    ).installationId;
    // Declared after installing, as a release would, so the install itself asks for nothing.
    await versions.update(version.id, { credentialRequirements: ['ai', 'slack'] });
    credentialId = await createCredential(app, {
      projectId: 'project-1',
      definitionId: 'openai',
      title: 'Team OpenAI',
      secret: { value: 'sk-test' },
      publicMetadata: null,
      ownerIds: ['alice'],
      contextIds: [],
    });
    const bind = (requirementKey: string, active: boolean) => {
      const snapshot = normalizeCredentialRequirement(requirementKey);
      return bindings.save(
        bindings.create({
          projectId: 'project-1',
          credentialId,
          consumerType: 'plugin-installation',
          consumerId: installationId,
          requirementKey,
          requirementSnapshot: snapshot,
          requirementRevision: requirementRevision(snapshot),
          configuredById: 'alice',
          active,
        })
      );
    };
    await bind('ai', true);
    await bind('slack', false);

    // Kept for the last case, which removes the installation.
    uninstall = () =>
      app.get(UninstallPluginService).run(new UninstallPluginCommand(plugin.id, ALICE));
  }, 120_000);

  afterAll(async () => {
    await closeTestApp(app);
  });

  const read = (token?: string) => {
    const request = agent.get(`/api/plugins/installations/${installationId}/credential-selections`);
    return token ? request.set('x-owox-authorization', token) : request;
  };

  it("answers the member with their installation's active grants, and nothing else", async () => {
    const response = await read(ALICE_TOKEN);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ credentialSelections: { ai: credentialId } });
  });

  it("answers 404 for another member's installation", async () => {
    const response = await read(BOB_TOKEN);

    expect(response.status).toBe(404);
    expect(JSON.stringify(response.body)).not.toContain(credentialId);
  });

  it("refuses the plugin's own runtime token for the member's own installation", async () => {
    const response = await read(PLUGIN_TOKEN);

    expect(response.status).toBe(403);
    expect(JSON.stringify(response.body)).toContain(
      'Plugin runtime authentication is not allowed for this endpoint'
    );
    expect(JSON.stringify(response.body)).not.toContain(credentialId);
  });

  it('refuses a request without a token', async () => {
    const response = await read();

    expect(response.status).toBe(401);
  });

  // Last: it removes the installation the other cases read.
  it('answers 404 once the plugin is uninstalled', async () => {
    await uninstall();

    const response = await read(ALICE_TOKEN);

    expect(response.status).toBe(404);
  });
});
