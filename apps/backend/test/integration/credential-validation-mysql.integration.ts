import 'reflect-metadata';
import { join } from 'node:path';
import { DataSource, type Repository } from 'typeorm';
import {
  addTransactionalDataSource,
  initializeTransactionalContext,
  StorageDriver,
} from 'typeorm-transactional';
import { Credential } from 'src/data-marts/credentials/entities/credential.entity';
import { CredentialService } from 'src/data-marts/credentials/services/credential.service';
import { ConvertSourceCredentials1793000000000 } from 'src/migrations/1793000000000-convert-source-credentials';
import { runMigrations } from 'src/migrations/migration-utils';
import { credentialValidationWriteCases } from '../fixtures/credential-validation-writes';

const MYSQL_HOST = process.env.CREDENTIAL_VALIDATION_MYSQL_HOST;
const MYSQL_PORT = parseInt(process.env.CREDENTIAL_VALIDATION_MYSQL_PORT ?? '3306', 10);
const MYSQL_USER = process.env.CREDENTIAL_VALIDATION_MYSQL_USER ?? 'root';
const MYSQL_PASSWORD = process.env.CREDENTIAL_VALIDATION_MYSQL_PASSWORD;
// A database of its own, created and dropped by this run, so the app's migrations start empty.
const DATABASE = `credential_validation_${Date.now()}`;
const SRC = join(__dirname, '../../src');

const available = !!MYSQL_HOST;
if (!available) {
  console.log(
    'Skipping Credential validation MySQL integration tests: CREDENTIAL_VALIDATION_MYSQL_HOST unset'
  );
}
if (available && !MYSQL_PASSWORD) {
  throw new Error(
    'CREDENTIAL_VALIDATION_MYSQL_HOST is set but CREDENTIAL_VALIDATION_MYSQL_PASSWORD is empty.'
  );
}

const describeIfAvailable = available ? describe : describe.skip;

describeIfAvailable('Credential validation writes (integration, MySQL)', () => {
  const server = {
    type: 'mysql',
    host: MYSQL_HOST,
    port: MYSQL_PORT,
    username: MYSQL_USER,
    password: MYSQL_PASSWORD!,
    logging: false,
  } as const;
  let admin: DataSource;
  let dataSource: DataSource;

  beforeAll(async () => {
    // updateSecretFields locks the row inside its @Transactional() transaction.
    initializeTransactionalContext({ storageDriver: StorageDriver.AUTO });
    admin = await new DataSource(server).initialize();
    await admin.query(`CREATE DATABASE \`${DATABASE}\``);
    // The app's entity and migration globs, so the schema is the one production runs on.
    dataSource = await new DataSource({
      ...server,
      database: DATABASE,
      entities: [`${SRC}/**/!(*.collection).entity{.ts,.js}`],
      migrations: [`${SRC}/migrations/[0-9]*-*.{ts,js}`],
      synchronize: false,
    }).initialize();
    await runMigrations(dataSource);
    addTransactionalDataSource(dataSource);
  }, 120_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (admin?.isInitialized) {
      await admin.query(`DROP DATABASE IF EXISTS \`${DATABASE}\``);
      await admin.destroy();
    }
  });

  it('runs on the migrated modifiedAt column: whole seconds, no ON UPDATE', async () => {
    const [column]: { precision: number | string; extra: string }[] = await dataSource.query(
      `SELECT DATETIME_PRECISION AS \`precision\`, EXTRA AS extra FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'credential' AND COLUMN_NAME = 'modifiedAt'`,
      [DATABASE]
    );

    expect(Number(column.precision)).toBe(0);
    expect(column.extra.toLowerCase()).not.toContain('on update');
  });

  credentialValidationWriteCases(() => dataSource);

  describe('Source Credential secret updates', () => {
    const ROTATED = 'generated_refresh_token';
    let credentials: Repository<Credential>;

    // One service per app replica: each has its own in-process queue, so only the row lock orders them.
    const replica = () =>
      new CredentialService(
        credentials,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never
      );

    beforeEach(async () => {
      credentials = dataSource.getRepository(Credential);
      await credentials.createQueryBuilder().delete().execute();
    });

    afterEach(() => jest.restoreAllMocks());

    async function givenConnected(): Promise<string> {
      const saved = await credentials.save(
        credentials.create({
          projectId: 'project-1',
          title: 'Ads account',
          definitionSource: 'builtin',
          definitionId: 'source:FacebookMarketing:oauth2',
          secret: { fields: { AccessToken: 'token-1', [ROTATED]: 'rotated-1' } },
          publicMetadata: {
            fields: { AppId: 'app-1' },
            connection: { account: null, expiresAt: '2026-11-01T00:00:00.000Z' },
          },
        })
      );
      return saved.id;
    }

    const stored = (id: string) => credentials.findOneByOrFail({ id });

    it('two replicas rotating one Credential with the same expected value: exactly one writes', async () => {
      const id = await givenConnected();
      // The first writer waits between its locked read and its write, so the other reads meanwhile.
      const update = credentials.update.bind(credentials);
      jest.spyOn(credentials, 'update').mockImplementationOnce(async (...args) => {
        await new Promise(resolve => setTimeout(resolve, 500));
        return update(...args);
      });

      const results = await Promise.all(
        ['rotated-a', 'rotated-b'].map(token =>
          replica().updateSecretFields(
            id,
            'project-1',
            { [ROTATED]: token },
            { [ROTATED]: 'rotated-1' }
          )
        )
      );

      expect(results.map(result => result.updated).sort()).toEqual([false, true]);
      const winner = results[0].updated ? 'rotated-a' : 'rotated-b';
      expect((await stored(id)).secret).toEqual({
        fields: { AccessToken: 'token-1', [ROTATED]: winner },
      });
    });

    it('changes nothing when the expected value no longer holds', async () => {
      const id = await givenConnected();
      const before = await stored(id);

      const result = await replica().updateSecretFields(
        id,
        'project-1',
        { [ROTATED]: 'rotated-2' },
        { [ROTATED]: 'rotated-0' },
        new Date('2027-01-01T00:00:00.000Z')
      );

      expect(result).toEqual({ updated: false });
      const after = await stored(id);
      expect(after.secret).toEqual(before.secret);
      expect(after.publicMetadata).toEqual(before.publicMetadata);
      expect(after.modifiedAt).toEqual(before.modifiedAt);
    });
  });

  describe('Credential rotation lease', () => {
    let otherPod: DataSource;

    beforeAll(async () => {
      otherPod = await new DataSource({
        ...server,
        database: DATABASE,
        entities: [`${SRC}/**/!(*.collection).entity{.ts,.js}`],
        synchronize: false,
      }).initialize();
    });

    afterAll(async () => {
      if (otherPod?.isInitialized) await otherPod.destroy();
    });

    it('two pods claiming one Credential at once: exactly one wins, and modifiedAt stays', async () => {
      const credentials = dataSource.getRepository(Credential);
      await credentials.createQueryBuilder().delete().execute();
      const { id } = await credentials.save(
        credentials.create({
          projectId: 'project-1',
          title: 'Acme',
          definitionSource: 'builtin',
          definitionId: 'custom-connector',
          secret: { fields: { RefreshToken: 'refresh-1', generated_refresh_token: 'rotated-1' } },
        })
      );
      const { modifiedAt } = await credentials.findOneByOrFail({ id });
      const pods = [dataSource, otherPod].map(
        source =>
          new CredentialService(
            source.getRepository(Credential),
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never
          )
      );

      const claims = await Promise.all(pods.map(pod => pod.claimRotation(id)));

      expect(claims.filter(claim => claim !== null)).toHaveLength(1);
      const winner = claims[0] ? 0 : 1;
      expect((await credentials.findOneByOrFail({ id })).modifiedAt).toEqual(modifiedAt);
      await expect(pods[1 - winner].claimRotation(id)).resolves.toBeNull();
      await pods[winner].releaseRotation(id, claims[winner]!);
      await expect(pods[1 - winner].claimRotation(id)).resolves.toEqual(expect.any(String));
      expect((await credentials.findOneByOrFail({ id })).modifiedAt).toEqual(modifiedAt);
    });

    it('marks a refresh token static once, and modifiedAt stays', async () => {
      const credentials = dataSource.getRepository(Credential);
      await credentials.createQueryBuilder().delete().execute();
      const { id } = await credentials.save(
        credentials.create({
          projectId: 'project-1',
          title: 'Acme',
          definitionSource: 'builtin',
          definitionId: 'custom-connector',
          secret: { fields: { RefreshToken: 'refresh-1' } },
        })
      );
      const before = await credentials.findOneByOrFail({ id });
      const service = new CredentialService(
        credentials,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never
      );

      await service.markRefreshTokenStatic(id);

      const marked = await credentials.findOneByOrFail({ id });
      expect(marked.refreshTokenStaticAt).toBeInstanceOf(Date);
      expect(marked.modifiedAt).toEqual(before.modifiedAt);
      await new Promise(resolve => setTimeout(resolve, 1100));
      await service.markRefreshTokenStatic(id);
      expect((await credentials.findOneByOrFail({ id })).refreshTokenStaticAt).toEqual(
        marked.refreshTokenStaticAt
      );
    });
  });

  it('a failed Source key conversion rolls back, though earlier DDL committed the run transaction', async () => {
    await dataSource.getRepository(Credential).createQueryBuilder().delete().execute();
    await dataSource.query(
      `INSERT INTO connector_source_credentials (id, projectId, connectorName, credentials, createdAt, modifiedAt)
       VALUES ('row-1', 'project-1', 'GitHub', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [JSON.stringify({ AccessToken: 'ghp-1' })]
    );
    await dataSource.query(
      `INSERT INTO data_mart (id, title, definitionType, definition, projectId, createdById, createdAt, modifiedAt)
       VALUES ('data-mart-1', 'Stars', 'CONNECTOR', ?, 'project-1', 'creator-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        JSON.stringify({
          connector: {
            source: {
              name: 'GitHub',
              configuration: [
                { _id: 'config-1', _secrets_id: 'row-1' },
                { _id: 'config-2', _secrets_id: 'row-1' },
              ],
            },
          },
        }),
      ]
    );
    await dataSource.query(
      "INSERT INTO data_mart_technical_owners (data_mart_id, user_id) VALUES ('data-mart-1', 'tech-1')"
    );
    const runner = dataSource.createQueryRunner();
    const query = runner.query.bind(runner);
    // The second binding is refused, so the first one exists when the conversion fails.
    let bindingInserts = 0;
    jest.spyOn(runner, 'query').mockImplementation(async (sql: string, parameters?: unknown[]) => {
      if (sql.includes('INSERT INTO credential_consumer_binding') && ++bindingInserts === 2)
        throw new Error('binding refused');
      return query(sql, parameters);
    });

    try {
      await runner.startTransaction();
      // As an earlier migration's DDL does in the same run.
      await runner.query('CREATE TABLE conversion_ddl_probe (id INT)');
      await expect(new ConvertSourceCredentials1793000000000().up(runner)).rejects.toThrow(
        'Source keys were not converted: binding refused'
      );
      await runner.rollbackTransaction();
    } finally {
      await runner.release();
    }

    expect(bindingInserts).toBe(2);
    expect(await dataSource.query('SELECT id FROM credential_consumer_binding')).toEqual([]);
    expect(await dataSource.query('SELECT id FROM credential')).toEqual([]);
    expect(await dataSource.query('SELECT credential_id FROM credential_owners')).toEqual([]);
  });
});
