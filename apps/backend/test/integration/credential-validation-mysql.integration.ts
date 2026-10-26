import 'reflect-metadata';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
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
});
