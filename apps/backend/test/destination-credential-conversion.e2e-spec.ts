import { INestApplication } from '@nestjs/common';
import { closeTestApp, createTestApp } from '@owox/test-utils';
import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import { CustomLoggerService } from '../src/common/logger/logger.service';
import { GoogleServiceAccountKeySchema } from '../src/common/schemas/google-service-account-key.schema';
import { CredentialConsumerBinding } from '../src/data-marts/credentials/entities/credential-consumer-binding.entity';
import { Credential } from '../src/data-marts/credentials/entities/credential.entity';
import { requirementRevision } from '../src/data-marts/credentials/services/credential-requirement-revision';
import { DataDestinationCredentialsResolver } from '../src/data-marts/data-destination-types/data-destination-credentials-resolver.service';
import {
  DESTINATION_BINDING,
  destinationCredentialRequirement,
} from '../src/data-marts/data-destination-types/destination-credential-state';
import { DataDestinationType } from '../src/data-marts/data-destination-types/enums/data-destination-type.enum';
import { DataDestination } from '../src/data-marts/entities/data-destination.entity';
import { UNCONVERTED_DESTINATIONS_SQL } from '../src/data-marts/services/destination-credential-conversion/legacy-destination-credential-sql';
import { GoogleOAuthConfigService } from '../src/data-marts/services/google-oauth/google-oauth-config.service';
import { ConvertDestinationCredentials1792700000000 } from '../src/migrations/1792700000000-convert-destination-credentials';
import {
  CHAT_WEBHOOK_URL,
  createServiceAccountCredential,
} from './fixtures/destination-credentials';
import { GOOGLE_OAUTH_ENV } from './fixtures/google-oauth';
import { serviceAccountKey } from './fixtures/google-service-account-key';

const PROJECT = 'project-1';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const SHEETS_SNAPSHOT = {
  definitionIds: ['google-service-account', 'google-sheets-oauth'],
  scopes: null,
};

interface DestinationSeed {
  type?: DataDestinationType;
  keyType: string;
  key: Record<string, unknown>;
  identity?: Record<string, unknown>;
  owners?: string[];
  contexts?: string[];
}

function serviceAccountSeed(key: string, seed: Partial<DestinationSeed> = {}): DestinationSeed {
  return {
    keyType: 'google_service_account',
    key: { type: 'google-sheets-credentials', serviceAccountKey: JSON.parse(key) },
    ...seed,
  };
}

function webhookSeed(webhookUrl: string, seed: Partial<DestinationSeed> = {}): DestinationSeed {
  return {
    type: DataDestinationType.GOOGLE_CHAT,
    keyType: 'google_chat_webhook',
    key: { type: 'google-chat-credentials', webhookUrl },
    ...seed,
  };
}

// Every test starts with Google sign-in off, whatever the runner's environment holds.
const savedSignInEnv = Object.keys(GOOGLE_OAUTH_ENV).map(key => [key, process.env[key]] as const);

describe('Destination key conversion migration (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const contexts: string[] = [];

  beforeAll(async () => {
    app = (await createTestApp()).app;
    dataSource = app.get(DataSource);
    for (const name of ['c1', 'c2', 'c3']) {
      const id = crypto.randomUUID();
      await dataSource.query(
        `INSERT INTO context (id, name, projectId, createdAt, modifiedAt)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [id, name, PROJECT]
      );
      contexts.push(id);
    }
  }, 120_000);

  afterAll(async () => {
    await closeTestApp(app);
    for (const [key, value] of savedSignInEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  beforeEach(() => {
    for (const [key] of savedSignInEnv) delete process.env[key];
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** A Destination on an old key row, seeded by SQL as release N-1 wrote it. */
  async function givenDestination(seed: DestinationSeed): Promise<string> {
    const rowId = crypto.randomUUID();
    await dataSource.query(
      `INSERT INTO data_destination_credentials (id, projectId, type, credentials, identity, createdAt, modifiedAt)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        rowId,
        PROJECT,
        seed.keyType,
        JSON.stringify(seed.key),
        seed.identity ? JSON.stringify(seed.identity) : null,
      ]
    );
    const destinationId = crypto.randomUUID();
    await dataSource.query(
      `INSERT INTO data_destination (id, title, type, projectId, credentialId,
         availableForUse, availableForMaintenance, createdAt, modifiedAt)
       VALUES (?, ?, ?, ?, ?, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [destinationId, 'Sales', seed.type ?? DataDestinationType.GOOGLE_SHEETS, PROJECT, rowId]
    );
    for (const userId of seed.owners ?? ['editor-1']) {
      await dataSource.query(
        'INSERT INTO destination_owners (destination_id, user_id) VALUES (?, ?)',
        [destinationId, userId]
      );
    }
    for (const contextId of seed.contexts ?? []) {
      await dataSource.query(
        'INSERT INTO destination_contexts (destination_id, context_id) VALUES (?, ?)',
        [destinationId, contextId]
      );
    }
    return destinationId;
  }

  async function convert(): Promise<void> {
    const queryRunner = dataSource.createQueryRunner();
    try {
      await new ConvertDestinationCredentials1792700000000().up(queryRunner);
    } finally {
      await queryRunner.release();
    }
  }

  function rows(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
    return dataSource.query(sql, params);
  }

  function bindingsOf(destinationId: string): Promise<Record<string, unknown>[]> {
    return rows('SELECT * FROM credential_consumer_binding WHERE consumerId = ?', [destinationId]);
  }

  /** Binds the Destination as the API would, without its member checks. */
  async function bindDestination(projectId: string, destinationId: string, credentialId: string) {
    const requirement = destinationCredentialRequirement(
      DataDestinationType.GOOGLE_SHEETS,
      app.get(GoogleOAuthConfigService)
    );
    await dataSource.getRepository(CredentialConsumerBinding).insert({
      ...DESTINATION_BINDING,
      consumerId: destinationId,
      projectId,
      credentialId,
      requirementSnapshot: requirement,
      requirementRevision: requirementRevision(requirement),
      configuredById: null,
      active: true,
    });
  }

  async function unconverted(destinationId: string): Promise<boolean> {
    return (await rows(UNCONVERTED_DESTINATIONS_SQL)).some(row => row.id === destinationId);
  }

  /** What a report run reads for the Destination. */
  async function resolved(destinationId: string) {
    const destination = await dataSource
      .getRepository(DataDestination)
      .findOneByOrFail({ id: destinationId });
    return app.get(DataDestinationCredentialsResolver).resolve(destination);
  }

  it('converts one service account key into a Not shared Credential that report runs read', async () => {
    const [c1, c2, c3] = contexts;
    const key = serviceAccountKey({ client_email: 'sheets@acme.iam.gserviceaccount.com' });
    const first = await givenDestination(
      serviceAccountSeed(key, { owners: ['editor-1', 'viewer-1'], contexts: [c1, c2] })
    );
    const second = await givenDestination(
      serviceAccountSeed(key, { owners: ['viewer-1', 'editor-1'], contexts: [c2, c3] })
    );
    const otherOwners = await givenDestination(serviceAccountSeed(key, { owners: ['editor-1'] }));

    await convert();

    const [binding] = await bindingsOf(first);
    expect(await bindingsOf(second)).toEqual([
      expect.objectContaining({ credentialId: binding.credentialId }),
    ]);
    const [otherBinding] = await bindingsOf(otherOwners);
    expect(otherBinding.credentialId).not.toBe(binding.credentialId);
    expect(binding).toMatchObject({
      projectId: PROJECT,
      consumerType: 'destination',
      requirementKey: 'destination',
      requirementRevision: requirementRevision(SHEETS_SNAPSHOT),
      configuredById: null,
      active: 1,
    });
    expect(JSON.parse(binding.requirementSnapshot as string)).toEqual(SHEETS_SNAPSHOT);
    const [credential] = await rows('SELECT * FROM credential WHERE id = ?', [
      binding.credentialId,
    ]);
    expect(credential).toMatchObject({
      projectId: PROJECT,
      title: 'sheets@acme.iam.gserviceaccount.com',
      definitionSource: 'builtin',
      definitionId: 'google-service-account',
      enabled: 1,
      // Not shared, although the Destinations were.
      availableForUse: 0,
      availableForMaintenance: 0,
      validationState: 'unknown',
      createdById: null,
      deletedAt: null,
    });
    const owners = await rows(
      'SELECT user_id FROM credential_owners WHERE credential_id = ? ORDER BY user_id',
      [binding.credentialId]
    );
    expect(owners.map(row => row.user_id)).toEqual(['editor-1', 'viewer-1']);
    expect(
      await rows('SELECT context_id FROM credential_contexts WHERE credential_id = ?', [
        binding.credentialId,
      ])
    ).toEqual([{ context_id: c2 }]);
    // The old key plus the defaults the key schema adds.
    await expect(resolved(second)).resolves.toEqual({
      type: 'google-sheets-credentials',
      serviceAccountKey: GoogleServiceAccountKeySchema.parse(JSON.parse(key)),
    });
  });

  it('converts a Google Chat webhook that report runs read, and leaves email delivery and other types alone', async () => {
    const chat = await givenDestination(webhookSeed(CHAT_WEBHOOK_URL));
    const byEmail = await givenDestination({
      type: DataDestinationType.GOOGLE_CHAT,
      keyType: 'email',
      key: { type: 'email-credentials', to: ['team@example.com'] },
    });
    const slack = await givenDestination({
      type: DataDestinationType.SLACK,
      keyType: 'email',
      key: { type: 'email-credentials', to: ['team@example.com'] },
    });

    await convert();

    const [binding] = await bindingsOf(chat);
    expect(JSON.parse(binding.requirementSnapshot as string)).toEqual({
      definitionIds: ['google-chat-webhook'],
      scopes: [],
    });
    const credential = await dataSource
      .getRepository(Credential)
      .findOneByOrFail({ id: binding.credentialId as string });
    expect(credential).toMatchObject({ definitionId: 'google-chat-webhook', title: 'Sales' });
    expect(credential.secret).toEqual({ fields: { webhookUrl: CHAT_WEBHOOK_URL } });
    await expect(resolved(chat)).resolves.toEqual({
      type: 'google-chat-credentials',
      webhookUrl: CHAT_WEBHOOK_URL,
    });
    expect(await bindingsOf(byEmail)).toEqual([]);
    expect(await bindingsOf(slack)).toEqual([]);
    await expect(resolved(byEmail)).resolves.toEqual({
      type: 'email-credentials',
      to: ['team@example.com'],
    });
  });

  it('leaves a Destination bound by the API alone, also when its binding sits in another project', async () => {
    const chosenId = await createServiceAccountCredential(app, {
      projectId: PROJECT,
      title: 'Chosen',
      ownerIds: ['editor-1'],
      clientEmail: 'chosen@acme.iam.gserviceaccount.com',
    });
    const key = serviceAccountKey({ client_email: 'old@acme.iam.gserviceaccount.com' });
    const bound = await givenDestination(serviceAccountSeed(key));
    await bindDestination(PROJECT, bound, chosenId);
    // A move by release N-1 after the migration leaves the binding in the old project.
    const movedAway = await givenDestination(serviceAccountSeed(key));
    await bindDestination('project-2', movedAway, chosenId);

    await convert();

    expect(await bindingsOf(bound)).toEqual([
      expect.objectContaining({ projectId: PROJECT, credentialId: chosenId, active: 1 }),
    ]);
    expect(await bindingsOf(movedAway)).toEqual([
      expect.objectContaining({ projectId: 'project-2', credentialId: chosenId, active: 1 }),
    ]);
    expect(await unconverted(movedAway)).toBe(false);
  });

  it('keeps a Destination it cannot convert on its old key and logs why', async () => {
    const warn = jest.spyOn(CustomLoggerService.prototype, 'warn');
    const invalid = await givenDestination(
      webhookSeed('https://example.com/v1/spaces/s/messages?key=k&token=leaked-token')
    );
    const oauth = await givenDestination({
      keyType: 'google_oauth',
      key: { access_token: 'access-1', refresh_token: 'refresh-skipped', token_type: 'Bearer' },
    });

    await convert();

    expect(warn).toHaveBeenCalledWith(
      `Destination ${invalid} keeps its old key: not a Google Chat webhook URL`
    );
    expect(warn).toHaveBeenCalledWith(
      `Destination ${oauth} keeps its old key: Google sign-in is not configured`
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('leaked-token');
    expect(await bindingsOf(invalid)).toEqual([]);
    expect(await bindingsOf(oauth)).toEqual([]);
  });

  it('converts a Google OAuth row to a Sheets Google account of the destination client', async () => {
    Object.assign(process.env, GOOGLE_OAUTH_ENV);
    const tokens = {
      access_token: 'access-1',
      refresh_token: 'refresh-1',
      token_type: 'Bearer',
      scope: `${SHEETS_SCOPE} openid`,
      expiry_date: 1000,
    };
    const destinationId = await givenDestination({
      keyType: 'google_oauth',
      key: { ...tokens, id_token: 'id-token-1' },
      identity: { email: 'ann@example.com', name: 'Ann', picture: 'p.png' },
    });

    await convert();

    const [binding] = await bindingsOf(destinationId);
    expect(JSON.parse(binding.requirementSnapshot as string)).toEqual({
      ...SHEETS_SNAPSHOT,
      scopes: [SHEETS_SCOPE],
    });
    const credential = await dataSource
      .getRepository(Credential)
      .findOneByOrFail({ id: binding.credentialId as string });
    expect(credential).toMatchObject({
      definitionId: 'google-sheets-oauth',
      title: 'ann@example.com',
    });
    expect(credential.secret).toEqual({
      oauth: {
        provider: 'google',
        clientId: GOOGLE_OAUTH_ENV.OAUTH_GOOGLE_DESTINATION_CLIENT_ID,
        tokens,
      },
    });
    expect(credential.publicMetadata).toEqual({
      account: { email: 'ann@example.com', name: 'Ann', picture: 'p.png' },
      scopes: [SHEETS_SCOPE, 'openid'],
    });
  });

  it('logs a converted Destination whose Google grant lacks a configured Sheets scope', async () => {
    const warn = jest.spyOn(CustomLoggerService.prototype, 'warn');
    Object.assign(process.env, GOOGLE_OAUTH_ENV);
    process.env.OAUTH_GOOGLE_SHEETS_SCOPE = `${SHEETS_SCOPE} https://www.googleapis.com/auth/drive.readonly`;
    try {
      const destinationId = await givenDestination({
        keyType: 'google_oauth',
        key: {
          access_token: 'access-1',
          refresh_token: 'refresh-1',
          token_type: 'Bearer',
          scope: SHEETS_SCOPE,
          expiry_date: 1000,
        },
        identity: { email: 'ann@example.com' },
      });

      await convert();

      expect(warn).toHaveBeenCalledWith(
        `Destination ${destinationId} stops until its Credential is reconnected: its Google grant lacks a configured Sheets scope`
      );
      expect(await bindingsOf(destinationId)).toHaveLength(1);
    } finally {
      delete process.env.OAUTH_GOOGLE_SHEETS_SCOPE;
    }
  });

  it('copies only the Contexts of the Destination project that are not deleted', async () => {
    const insertContext = async (projectId: string, deleted: boolean) => {
      const id = crypto.randomUUID();
      await dataSource.query(
        `INSERT INTO context (id, name, projectId, createdAt, modifiedAt, deletedAt)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)`,
        [id, `context ${id}`, projectId, deleted ? new Date().toISOString() : null]
      );
      return id;
    };
    const foreign = await insertContext('project-2', false);
    const deleted = await insertContext(PROJECT, true);
    const destinationId = await givenDestination(
      webhookSeed(CHAT_WEBHOOK_URL.replace('token-1', 'token-contexts'), {
        contexts: [contexts[0], foreign, deleted],
      })
    );

    await convert();

    const [binding] = await bindingsOf(destinationId);
    expect(
      await rows('SELECT context_id FROM credential_contexts WHERE credential_id = ?', [
        binding.credentialId,
      ])
    ).toEqual([{ context_id: contexts[0] }]);
  });

  it('rolls back every conversion write when one write fails', async () => {
    const first = await givenDestination(
      webhookSeed(CHAT_WEBHOOK_URL.replace('token-1', 'token-rollback-1'))
    );
    const second = await givenDestination(
      webhookSeed(CHAT_WEBHOOK_URL.replace('token-1', 'token-rollback-2'))
    );
    const counts = () =>
      Promise.all(
        [
          'credential',
          'credential_owners',
          'credential_contexts',
          'credential_consumer_binding',
        ].map(table => rows(`SELECT COUNT(*) AS n FROM ${table}`))
      );
    const before = await counts();
    const queryRunner = dataSource.createQueryRunner();
    const query = queryRunner.query.bind(queryRunner);
    let bindings = 0;
    jest.spyOn(queryRunner, 'query').mockImplementation((async (
      sql: string,
      params?: unknown[]
    ) => {
      if (
        sql.trimStart().startsWith('INSERT INTO credential_consumer_binding') &&
        ++bindings === 2
      ) {
        throw new Error('disk full');
      }
      return query(sql, params);
    }) as never);

    await queryRunner.startTransaction();
    try {
      await expect(
        new ConvertDestinationCredentials1792700000000().up(queryRunner)
      ).rejects.toThrow('Destination keys were not converted: disk full');
      await queryRunner.rollbackTransaction();
    } finally {
      await queryRunner.release();
    }

    expect(await counts()).toEqual(before);
    expect(await bindingsOf(first)).toEqual([]);
    expect(await bindingsOf(second)).toEqual([]);
  });

  it('changes nothing when it runs again', async () => {
    const destinationId = await givenDestination(
      webhookSeed(CHAT_WEBHOOK_URL.replace('token-1', 'token-again'))
    );
    await convert();
    const written = () =>
      Promise.all(
        [
          'SELECT * FROM credential ORDER BY id',
          'SELECT * FROM credential_owners ORDER BY credential_id, user_id',
          'SELECT * FROM credential_contexts ORDER BY credential_id, context_id',
          'SELECT * FROM credential_consumer_binding ORDER BY id',
        ].map(sql => rows(sql))
      );
    const before = await written();

    await convert();

    expect(await written()).toEqual(before);
    expect(await bindingsOf(destinationId)).toHaveLength(1);
  });
});
