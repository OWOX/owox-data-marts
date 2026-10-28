import { INestApplication } from '@nestjs/common';
import type { IdpProvider, Payload } from '@owox/idp-protocol';
import { AUTH_HEADER, closeTestApp, createTestApp } from '@owox/test-utils';
import * as crypto from 'crypto';
import * as supertest from 'supertest';
import { DataSource } from 'typeorm';
import { DataDestinationType } from '../src/data-marts/data-destination-types/enums/data-destination-type.enum';
import { GoogleSheetsFolderValidator } from '../src/data-marts/data-destination-types/google-sheets/services/google-sheets-folder-validator.service';
import { DestinationFolderAccessException } from '../src/data-marts/exceptions/google-oauth.exceptions';
import { GoogleOAuthConfigService } from '../src/data-marts/services/google-oauth/google-oauth-config.service';
import { ProjectMemberDto } from '../src/idp/dto/domain/project-member.dto';
import { IdpProjectionsFacade } from '../src/idp/facades/idp-projections.facade';
import { PluginRuntimeAuthorizerService } from '../src/plugin-host/services/plugin-runtime-authorizer.service';
import {
  boundDestinationCredentialId,
  createChatWebhookCredential,
  createServiceAccountCredential,
} from './fixtures/destination-credentials';
import { createCredential } from './fixtures/storage-credentials';

const OWNER_AUTH_HEADER = { 'x-owox-authorization': 'owner-token' };
const OTHER_AUTH_HEADER = { 'x-owox-authorization': 'other-token' };
const PLUGIN_AUTH_HEADER = { 'x-owox-authorization': 'plugin-token' };
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const CLIENT_EMAIL = 'docs-writer@acme-docs.iam.gserviceaccount.com';

function payload(userId: string, roles: Payload['roles']): Payload {
  return { userId, email: `${userId}@localhost`, roles, fullName: userId, projectId: '0' };
}

function resolvePayload(token: string): Payload {
  if (token.startsWith('plugin')) {
    // A plugin acting for the owner, who may use every Credential below.
    return {
      ...payload('1', ['editor']),
      authFlow: 'plugin',
      pluginId: 'plugin-1',
      installationId: 'installation-1',
    };
  }
  if (token.startsWith('owner')) return payload('1', ['editor']);
  if (token.startsWith('other')) return payload('3', ['editor']);
  return payload('0', ['admin']);
}

describe('Destinations select a Credential (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let dataSource: DataSource;
  let ownerKeyId: string;
  let ownerWebhookId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;
    dataSource = app.get(DataSource);

    const expressApp = app.getHttpAdapter().getInstance() as { get(name: string): unknown };
    const idpProvider = expressApp.get('idp') as IdpProvider;
    jest.spyOn(idpProvider, 'introspectToken').mockImplementation(async t => resolvePayload(t));
    jest.spyOn(idpProvider, 'parseToken').mockImplementation(async t => resolvePayload(t));
    // The test identity provider knows only the admin; the owner creates Destinations here.
    jest
      .spyOn(app.get(IdpProjectionsFacade), 'getProjectMembers')
      .mockResolvedValue([
        new ProjectMemberDto('0', 'admin@localhost', 'Admin', undefined, 'admin', true, false),
        new ProjectMemberDto('1', 'owner@localhost', 'Owner', undefined, 'editor', true, false),
        new ProjectMemberDto('3', 'other@localhost', 'Other', undefined, 'editor', true, false),
      ]);
    jest
      .spyOn(app.get(PluginRuntimeAuthorizerService), 'assertActiveInstallation')
      .mockResolvedValue(undefined);
    // Google sign-in for Destinations as configured on a server; no call reaches Google.
    const oauthConfig = app.get(GoogleOAuthConfigService);
    jest.spyOn(oauthConfig, 'isDestinationConfigured').mockReturnValue(true);
    jest
      .spyOn(oauthConfig, 'getSheetsScopes')
      .mockReturnValue([SHEETS_SCOPE, 'openid', 'email', 'profile']);

    ownerKeyId = await createServiceAccountCredential(app, {
      projectId: '0',
      title: 'Docs writer',
      ownerIds: ['1'],
      clientEmail: CLIENT_EMAIL,
    });
    ownerWebhookId = await createChatWebhookCredential(app, {
      projectId: '0',
      title: 'Team space',
      ownerIds: ['1'],
    });
  }, 120_000);

  afterAll(async () => {
    await closeTestApp(app);
  });

  function create(headers: Record<string, string>, body: Record<string, unknown>) {
    return agent.post('/api/data-destinations').set(headers).send(body);
  }

  function put(destinationId: string, body: Record<string, unknown>) {
    return agent
      .put(`/api/data-destinations/${destinationId}`)
      .set(OWNER_AUTH_HEADER)
      .send({ title: 'Destination', ...body });
  }

  async function givenSheets(): Promise<string> {
    const res = await create(OWNER_AUTH_HEADER, {
      title: 'Sheets',
      type: DataDestinationType.GOOGLE_SHEETS,
      reusableCredentialId: ownerKeyId,
    }).expect(201);
    return res.body.id as string;
  }

  const visibleKey = () => ({
    access: 'visible',
    id: ownerKeyId,
    title: 'Docs writer',
    definitionId: 'google-service-account',
    providerName: 'Google Service Account',
    identity: CLIENT_EMAIL,
    state: 'ready',
  });

  it('creates a Google Sheets Destination bound to a Credential and reads it back', async () => {
    const created = await create(OWNER_AUTH_HEADER, {
      title: 'Sheets',
      type: DataDestinationType.GOOGLE_SHEETS,
      reusableCredentialId: ownerKeyId,
    });

    expect(created.status).toBe(201);
    const id = created.body.id as string;
    const one = await agent.get(`/api/data-destinations/${id}`).set(OWNER_AUTH_HEADER).expect(200);
    const list = await agent.get('/api/data-destinations').set(OWNER_AUTH_HEADER).expect(200);
    const listed = (list.body as Array<{ id: string }>).find(item => item.id === id);

    for (const body of [created.body, one.body, listed]) {
      expect(body).toMatchObject({ reusableCredential: visibleKey() });
      expect(body).not.toHaveProperty('credentialId');
    }
    // The Sheets add-in reads the account from `credentials`; the key itself never leaves.
    for (const body of [one.body, listed]) {
      expect(body.credentials).toEqual({
        type: 'google-sheets-credentials',
        serviceAccountKey: {
          type: 'service_account',
          project_id: expect.any(String),
          client_email: CLIENT_EMAIL,
        },
      });
    }
    expect(JSON.stringify(list.body)).not.toContain('private_key');
    expect(await boundDestinationCredentialId(app, id)).toBe(ownerKeyId);
  });

  it("refuses another member's Not shared Credential and creates nothing", async () => {
    const title = `Not mine ${crypto.randomUUID()}`;

    const res = await create(OTHER_AUTH_HEADER, {
      title,
      type: DataDestinationType.GOOGLE_SHEETS,
      reusableCredentialId: ownerKeyId,
    });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('You cannot use this Credential.');
    const rows = (await dataSource.query('SELECT id FROM data_destination WHERE title = ?', [
      title,
    ])) as unknown[];
    expect(rows).toHaveLength(0);
  });

  it('rolls the binding back when the Drive folder check fails', async () => {
    const title = `Folder fails ${crypto.randomUUID()}`;
    const countBindings = async () =>
      (
        (await dataSource.query(
          'SELECT COUNT(*) AS n FROM credential_consumer_binding WHERE credentialId = ?',
          [ownerKeyId]
        )) as Array<{ n: number }>
      )[0].n;
    const before = await countBindings();
    jest
      .spyOn(app.get(GoogleSheetsFolderValidator), 'validateConfiguredFolder')
      .mockRejectedValueOnce(new DestinationFolderAccessException('The folder is not usable.'));

    const res = await create(OWNER_AUTH_HEADER, {
      title,
      type: DataDestinationType.GOOGLE_SHEETS,
      reusableCredentialId: ownerKeyId,
      config: { folderUrl: 'https://drive.google.com/drive/folders/folder-1' },
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('The folder is not usable.');
    const rows = (await dataSource.query('SELECT id FROM data_destination WHERE title = ?', [
      title,
    ])) as unknown[];
    expect(rows).toHaveLength(0);
    expect(await countBindings()).toBe(before);
  });

  it('shows a member who cannot see the Credential that it is restricted and whom to share with', async () => {
    const id = await givenSheets();
    await agent
      .put(`/api/data-destinations/${id}/availability`)
      .set(OWNER_AUTH_HEADER)
      .send({ availableForUse: true, availableForMaintenance: false })
      .expect(204);

    const res = await agent.get(`/api/data-destinations/${id}`).set(OTHER_AUTH_HEADER).expect(200);

    expect(res.body.reusableCredential).toEqual({
      access: 'restricted',
      state: 'ready',
      identity: CLIENT_EMAIL,
      definitionId: 'google-service-account',
    });
    expect(res.body.credentials.serviceAccountKey.client_email).toBe(CLIENT_EMAIL);
  });

  it('says a Google Sheets Destination still on its own key is pending', async () => {
    const id = await givenSheets();
    const rowId = crypto.randomUUID();
    await dataSource.query(
      "UPDATE credential_consumer_binding SET active = 0 WHERE consumerType = 'destination' AND consumerId = ?",
      [id]
    );
    await dataSource.query(
      `INSERT INTO data_destination_credentials (id, projectId, type, credentials, identity, createdAt, modifiedAt)
       VALUES (?, '0', 'google_service_account', ?, ?, datetime('now'), datetime('now'))`,
      [
        rowId,
        JSON.stringify({
          type: 'google-sheets-credentials',
          serviceAccountKey: {
            type: 'service_account',
            project_id: 'acme-docs',
            client_email: 'old-key@acme-docs.iam.gserviceaccount.com',
            private_key: 'old-private-key-never-returned',
          },
        }),
        JSON.stringify({ clientEmail: 'old-key@acme-docs.iam.gserviceaccount.com' }),
      ]
    );
    await dataSource.query('UPDATE data_destination SET credentialId = ? WHERE id = ?', [
      rowId,
      id,
    ]);

    const one = await agent.get(`/api/data-destinations/${id}`).set(OWNER_AUTH_HEADER).expect(200);
    const list = await agent.get('/api/data-destinations').set(OWNER_AUTH_HEADER).expect(200);

    const pending = {
      access: 'pending',
      state: 'ready',
      identity: 'old-key@acme-docs.iam.gserviceaccount.com',
      definitionId: 'google-service-account',
    };
    expect(one.body.reusableCredential).toEqual(pending);
    expect(
      (list.body as Array<{ id: string; reusableCredential: unknown }>).find(item => item.id === id)
        ?.reusableCredential
    ).toEqual(pending);
    expect(one.body.credentials).toEqual({
      type: 'google-sheets-credentials',
      serviceAccountKey: {
        type: 'service_account',
        project_id: 'acme-docs',
        client_email: 'old-key@acme-docs.iam.gserviceaccount.com',
      },
    });
    expect(JSON.stringify([one.body, list.body])).not.toContain('old-private-key-never-returned');
  });

  it('switches a Google Chat Destination from webhook to email and back', async () => {
    const created = await create(OWNER_AUTH_HEADER, {
      title: 'Chat',
      type: DataDestinationType.GOOGLE_CHAT,
      reusableCredentialId: ownerWebhookId,
    }).expect(201);
    const id = created.body.id as string;
    expect(created.body.reusableCredential).toMatchObject({
      access: 'visible',
      definitionId: 'google-chat-webhook',
    });
    expect(created.body.credentials).toEqual({ type: 'google-chat-credentials', configured: true });

    const email = { type: 'email-credentials', to: ['space@example.com'] };
    const byEmail = await put(id, { credentials: email });

    expect(byEmail.status).toBe(200);
    expect(byEmail.body.credentials).toEqual(email);
    expect(byEmail.body).not.toHaveProperty('reusableCredential');
    expect(await boundDestinationCredentialId(app, id)).toBeNull();
    const [{ credentialId: emailRowId }] = (await dataSource.query(
      'SELECT credentialId FROM data_destination WHERE id = ?',
      [id]
    )) as Array<{ credentialId: string }>;

    const byWebhook = await put(id, { reusableCredentialId: ownerWebhookId });

    expect(byWebhook.status).toBe(200);
    expect(byWebhook.body.reusableCredential).toMatchObject({
      access: 'visible',
      id: ownerWebhookId,
    });
    expect(byWebhook.body.credentials).toEqual({
      type: 'google-chat-credentials',
      configured: true,
    });
    expect(await boundDestinationCredentialId(app, id)).toBe(ownerWebhookId);
    const [destination] = (await dataSource.query(
      'SELECT credentialId FROM data_destination WHERE id = ?',
      [id]
    )) as Array<{ credentialId: string | null }>;
    expect(destination.credentialId).toBeNull();
    const [row] = (await dataSource.query(
      'SELECT deletedAt FROM data_destination_credentials WHERE id = ?',
      [emailRowId]
    )) as Array<{ deletedAt: string | null }>;
    expect(row.deletedAt).not.toBeNull();
    expect(JSON.stringify(byWebhook.body)).not.toContain('token-1');
  });

  it('tells an older page that sends a webhook URL to reload it', async () => {
    const res = await create(OWNER_AUTH_HEADER, {
      title: 'Chat',
      type: DataDestinationType.GOOGLE_CHAT,
      credentials: {
        type: 'google-chat-credentials',
        webhookUrl: 'https://chat.googleapis.com/v1/spaces/s/messages?key=k&token=t',
      },
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('This page is out of date. Reload it.');
  });

  it('connects a Google Sheets Destination to a Credential, unshared', async () => {
    const res = await agent
      .post('/api/data-destinations/connect/google-sheets')
      .set(OWNER_AUTH_HEADER)
      .send({ title: 'Google Sheets (docs)', reusableCredentialId: ownerKeyId });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ availableForUse: false, reusableCredential: visibleKey() });
  });

  it('tells an older connect page that sends credentialId to reload it', async () => {
    const res = await agent
      .post('/api/data-destinations/connect/google-sheets')
      .set(OWNER_AUTH_HEADER)
      .send({ title: 'Google Sheets (docs)', credentialId: crypto.randomUUID() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('This page is out of date. Reload it.');
  });

  it('deactivates the binding of a deleted Destination', async () => {
    const id = await givenSheets();

    await agent.delete(`/api/data-destinations/${id}`).set(OWNER_AUTH_HEADER).expect(200);

    expect(await boundDestinationCredentialId(app, id)).toBeNull();
  });

  it('refuses to delete a Credential a Destination uses and keeps it', async () => {
    const keyId = await createServiceAccountCredential(app, {
      projectId: '0',
      title: 'Kept key',
      ownerIds: ['1'],
      clientEmail: CLIENT_EMAIL,
    });
    const res = await create(OWNER_AUTH_HEADER, {
      title: 'Sheets',
      type: DataDestinationType.GOOGLE_SHEETS,
      reusableCredentialId: keyId,
    }).expect(201);

    const refused = await agent.delete(`/api/credentials/${keyId}`).set(AUTH_HEADER);

    expect(refused.status).toBe(400);
    expect(refused.body.message).toBe(
      'Cannot delete the Credential because it is used by 1 active consumer(s).'
    );
    await agent.get(`/api/credentials/${keyId}`).set(AUTH_HEADER).expect(200);
    expect(await boundDestinationCredentialId(app, res.body.id as string)).toBe(keyId);
  });

  it('refuses a Credential the admin sends for a Looker Studio Destination', async () => {
    const res = await create(AUTH_HEADER, {
      title: 'Looker',
      type: DataDestinationType.LOOKER_STUDIO,
      reusableCredentialId: ownerKeyId,
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Data Studio destinations do not use a Credential.');
  });
  describe('with Sheets Google account Credentials', () => {
    const FOLDER_URL = 'https://drive.google.com/drive/folders/folder-1';
    let annId: string;
    let bobId: string;

    /** A Not shared Google account Credential as Connect with Google saves one, without its tokens. */
    function givenGoogleAccount(email: string): Promise<string> {
      return createCredential(app, {
        projectId: '0',
        definitionId: 'google-sheets-oauth',
        title: email,
        secret: {
          oauth: {
            provider: 'google',
            clientId: 'destination-client',
            tokens: {
              access_token: 'access-token',
              refresh_token: `refresh-token-${email}`,
              token_type: 'Bearer',
              scope: SHEETS_SCOPE,
            },
          },
        },
        publicMetadata: { account: { email, name: null, picture: null }, scopes: [SHEETS_SCOPE] },
        ownerIds: ['1'],
        contextIds: [],
      });
    }

    beforeAll(async () => {
      annId = await givenGoogleAccount('ann@example.com');
      bobId = await givenGoogleAccount('bob@example.com');
    });

    const account = (credentialId: string, email: string) => ({
      reusableCredential: {
        access: 'visible',
        id: credentialId,
        title: email,
        definitionId: 'google-sheets-oauth',
        providerName: expect.any(String),
        identity: email,
        state: 'ready',
      },
      credentials: { type: 'google-sheets-oauth-credentials', identity: { email } },
    });

    const read = (id: string) =>
      agent.get(`/api/data-destinations/${id}`).set(OWNER_AUTH_HEADER).expect(200);

    it('keeps a folder the save sends for another account and drops one it leaves out', async () => {
      const created = await create(OWNER_AUTH_HEADER, {
        title: 'Sheets',
        type: DataDestinationType.GOOGLE_SHEETS,
        reusableCredentialId: annId,
        config: { folderUrl: FOLDER_URL },
      }).expect(201);
      const id = created.body.id as string;
      expect(created.body).toMatchObject({
        ...account(annId, 'ann@example.com'),
        config: { folderUrl: FOLDER_URL },
      });

      await put(id, { reusableCredentialId: bobId, config: { folderUrl: FOLDER_URL } }).expect(200);
      const kept = await read(id);

      expect(kept.body).toMatchObject({
        ...account(bobId, 'bob@example.com'),
        config: { folderUrl: FOLDER_URL },
      });

      await put(id, { reusableCredentialId: annId }).expect(200);
      const cleared = await read(id);

      expect(cleared.body).toMatchObject(account(annId, 'ann@example.com'));
      expect(cleared.body.config).toBeNull();
      expect(await boundDestinationCredentialId(app, id)).toBe(annId);
      const bodies = JSON.stringify([created.body, kept.body, cleared.body]);
      expect(bodies).not.toContain('refresh-token-');
      expect(bodies).not.toContain('access-token');
    });

    it('keeps the folder when the save sends the bound Credential again', async () => {
      const created = await create(OWNER_AUTH_HEADER, {
        title: 'Sheets',
        type: DataDestinationType.GOOGLE_SHEETS,
        reusableCredentialId: bobId,
        config: { folderUrl: FOLDER_URL },
      }).expect(201);
      const id = created.body.id as string;

      await put(id, { reusableCredentialId: bobId }).expect(200);

      expect((await read(id)).body).toMatchObject({
        ...account(bobId, 'bob@example.com'),
        config: { folderUrl: FOLDER_URL },
      });
    });

    it('refuses a plugin that sends reusableCredentialId and keeps the binding', async () => {
      const created = await create(OWNER_AUTH_HEADER, {
        title: 'Sheets',
        type: DataDestinationType.GOOGLE_SHEETS,
        reusableCredentialId: annId,
      }).expect(201);
      const id = created.body.id as string;

      for (const reusableCredentialId of [bobId, annId]) {
        const res = await agent
          .put(`/api/data-destinations/${id}`)
          .set(PLUGIN_AUTH_HEADER)
          .send({ title: 'Sheets', reusableCredentialId });

        expect(res.status).toBe(403);
        expect(res.body.message).toBe("Plugins cannot change a Destination's Credential.");
      }
      expect(await boundDestinationCredentialId(app, id)).toBe(annId);
    });
  });
});
