import 'reflect-metadata';
import { DataSource } from 'typeorm';
import {
  CREDENTIAL_VALIDATION_ENTITIES,
  credentialValidationWriteCases,
} from '../fixtures/credential-validation-writes';

const MYSQL_HOST = process.env.CREDENTIAL_VALIDATION_MYSQL_HOST;
const MYSQL_PORT = parseInt(process.env.CREDENTIAL_VALIDATION_MYSQL_PORT ?? '3306', 10);
const MYSQL_USER = process.env.CREDENTIAL_VALIDATION_MYSQL_USER ?? 'root';
const MYSQL_PASSWORD = process.env.CREDENTIAL_VALIDATION_MYSQL_PASSWORD;
const MYSQL_DATABASE = process.env.CREDENTIAL_VALIDATION_MYSQL_DATABASE ?? 'owox_test';

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
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'mysql',
      host: MYSQL_HOST,
      port: MYSQL_PORT,
      username: MYSQL_USER,
      password: MYSQL_PASSWORD!,
      database: MYSQL_DATABASE,
      entities: CREDENTIAL_VALIDATION_ENTITIES,
      synchronize: true,
      logging: false,
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    for (const table of ['credential_contexts', 'credential_owners', 'credential', 'context']) {
      await dataSource.query(`DROP TABLE IF EXISTS \`${table}\``);
    }
    await dataSource.destroy();
  });

  credentialValidationWriteCases(() => dataSource);
});
