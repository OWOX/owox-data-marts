import 'reflect-metadata';
import { DataSource, Table } from 'typeorm';
import { CreateReusableCredentialTables1787788800000 } from './1787788800000-create-reusable-credential-tables';
import { AddPluginVersionCredentialRequirements1787788800001 } from './1787788800001-add-plugin-version-credential-requirements';
import { AddCredentialAiModelMappingSources1787788800002 } from './1787788800002-add-credential-ai-model-mapping-sources';
import { AddCredentialValidationState1787788800003 } from './1787788800003-add-credential-validation-state';

describe('Reusable Credentials migrations', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [],
      synchronize: false,
    });
    await dataSource.initialize();
    const runner = dataSource.createQueryRunner();
    await runner.createTable(
      new Table({
        name: 'context',
        columns: [{ name: 'id', type: 'varchar', length: '36', isPrimary: true }],
      })
    );
    await runner.createTable(
      new Table({
        name: 'plugin_version',
        columns: [{ name: 'id', type: 'varchar', length: '36', isPrimary: true }],
      })
    );
    await runner.release();
  });

  afterEach(async () => dataSource.destroy());

  it('creates reversible SQLite schema and preserves the Destination-like JSON secret', async () => {
    const runner = dataSource.createQueryRunner();
    const core = new CreateReusableCredentialTables1787788800000();
    const plugin = new AddPluginVersionCredentialRequirements1787788800001();
    const mappingSources = new AddCredentialAiModelMappingSources1787788800002();
    const validationState = new AddCredentialValidationState1787788800003();

    await core.up(runner);
    await plugin.up(runner);
    await mappingSources.up(runner);
    await validationState.up(runner);

    expect(await runner.hasTable('credential')).toBe(true);
    expect(await runner.hasTable('credential_consumer_binding')).toBe(true);
    expect(await runner.hasColumn('plugin_version', 'credentialRequirements')).toBe(true);
    expect(await runner.hasColumn('credential', 'aiModelMappingSources')).toBe(true);
    expect(await runner.hasColumn('credential', 'validationState')).toBe(true);
    expect(await runner.hasColumn('credential', 'validationMessage')).toBe(true);
    expect(await runner.hasColumn('credential', 'validatedAt')).toBe(true);

    await runner.query(
      `INSERT INTO credential
       (id, projectId, title, definitionSource, definitionId, secret, enabled,
        availableForUse, availableForMaintenance, createdAt, modifiedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        'credential-1',
        'project-1',
        'GitHub',
        'builtin',
        'github',
        JSON.stringify({ value: 'provider-secret' }),
        1,
        1,
        0,
      ]
    );
    const [stored] = (await runner.query('SELECT secret FROM credential WHERE id = ?', [
      'credential-1',
    ])) as Array<{ secret: string }>;
    expect(JSON.parse(stored.secret)).toEqual({ value: 'provider-secret' });

    const [validation] = (await runner.query(
      'SELECT validationState, validationMessage, validatedAt FROM credential WHERE id = ?',
      ['credential-1']
    )) as Array<{
      validationState: string;
      validationMessage: string | null;
      validatedAt: string | null;
    }>;
    expect(validation).toEqual({
      validationState: 'unknown',
      validationMessage: null,
      validatedAt: null,
    });

    await validationState.down(runner);
    await mappingSources.down(runner);
    await plugin.down(runner);
    expect(await runner.hasColumn('credential', 'aiModelMappingSources')).toBe(false);
    expect(await runner.hasColumn('credential', 'validationState')).toBe(false);
    await core.down(runner);
    expect(await runner.hasColumn('plugin_version', 'credentialRequirements')).toBe(false);
    expect(await runner.hasTable('credential')).toBe(false);
    await runner.release();
  });
});
