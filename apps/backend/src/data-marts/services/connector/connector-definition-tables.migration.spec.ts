import { DataSource, QueryRunner, Repository, Table } from 'typeorm';
import {
  addTransactionalDataSource,
  deleteDataSourceByName,
  initializeTransactionalContext,
  StorageDriver,
} from 'typeorm-transactional';

import { McpConnectorAuthoringFacadeImpl } from '../../facades/mcp-connector-authoring.facade.impl';
import { CreateConnectorDefinitionTables1788048000000 } from '../../../migrations/1788048000000-create-connector-definition-tables';
import { ConnectorDefinition } from '../../entities/connector-definition.entity';
import {
  ConnectorDefinitionVersion,
  ConnectorDefinitionVersionStatus,
} from '../../entities/connector-definition-version.entity';
import { ConnectorDefinitionService } from './connector-definition.service';

const DEFINITION_TABLE = 'connector_definition';
const VERSION_TABLE = 'connector_definition_version';

const VALID_MANIFEST = {
  version: '1.0',
  name: 'MyCustom',
  baseUrl: 'https://api.example.com',
  parameters: { Token: { requiredType: 'string', isRequired: true, label: 'Token' } },
  nodes: {
    items: {
      fields: { id: { type: 'string' } },
      request: { method: 'GET', path: '/items' },
      recordSelector: { recordPath: [] },
    },
  },
};

const createSqliteDataSource = async (): Promise<DataSource> => {
  const dataSource = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [ConnectorDefinition, ConnectorDefinitionVersion],
    synchronize: false,
    logging: false,
  });
  await dataSource.initialize();
  return dataSource;
};

const schemaObjects = async (
  queryRunner: QueryRunner
): Promise<Array<{ type: string; name: string; tbl_name: string }>> =>
  (await queryRunner.query(
    "SELECT type, name, tbl_name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
  )) as Array<{ type: string; name: string; tbl_name: string }>;

const indexNames = async (queryRunner: QueryRunner, table: string): Promise<string[]> =>
  ((await queryRunner.getTable(table))?.indices.map(index => index.name ?? '') ?? []).sort();

type DdlMethod = 'createTable' | 'createIndex' | 'createForeignKey';

/**
 * Wraps a query runner so the Nth call to the named DDL method blows up, standing in for a
 * pod that dies mid-migration. On MySQL the DDL already executed auto-commits, so the next
 * pod re-runs up() against a half-built schema and no migration row.
 */
const crashOnDdlCall = (
  queryRunner: QueryRunner,
  method: DdlMethod,
  failOnCall: number
): QueryRunner => {
  let calls = 0;
  return new Proxy(queryRunner, {
    get(target, property, receiver) {
      if (property === method) {
        return async (...args: unknown[]) => {
          calls += 1;
          if (calls === failOnCall) {
            throw new Error('pod terminated mid-migration');
          }
          return (target[method] as unknown as (...callArgs: unknown[]) => Promise<void>).apply(
            target,
            args
          );
        };
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as QueryRunner;
};

type DropMethod = 'dropForeignKey' | 'dropIndex';
const DROP_METHODS: readonly DropMethod[] = ['dropForeignKey', 'dropIndex'];

/**
 * Wraps a query runner so every drop it is asked to perform is appended to `log` in issue
 * order and then delegated untouched, which makes the sequence of down() assertable.
 */
const recordDropCalls = (
  queryRunner: QueryRunner,
  log: Array<{ method: DropMethod; table: string }>
): QueryRunner =>
  new Proxy(queryRunner, {
    get(target, property, receiver) {
      if (DROP_METHODS.includes(property as DropMethod)) {
        const method = property as DropMethod;
        return async (...args: unknown[]) => {
          const [tableOrName] = args as [Table | string];
          log.push({
            method,
            table: typeof tableOrName === 'string' ? tableOrName : tableOrName.name,
          });
          return (target[method] as unknown as (...callArgs: unknown[]) => Promise<void>).apply(
            target,
            args
          );
        };
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as QueryRunner;

describe('CreateConnectorDefinitionTables1788048000000', () => {
  const migration = new CreateConnectorDefinitionTables1788048000000();
  let dataSource: DataSource;
  let queryRunner: QueryRunner;

  beforeEach(async () => {
    dataSource = await createSqliteDataSource();
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
  });

  afterEach(async () => {
    await queryRunner.release();
    await dataSource.destroy();
  });

  it('creates both tables, their indexes and the version foreign key', async () => {
    await migration.up(queryRunner);

    expect(await indexNames(queryRunner, DEFINITION_TABLE)).toEqual([
      'IDX_connector_definition_projectId',
      'IDX_connector_definition_projectId_name',
    ]);
    expect(await indexNames(queryRunner, VERSION_TABLE)).toEqual([
      'IDX_connector_definition_version_definitionId',
      'IDX_connector_definition_version_definitionId_version',
    ]);
    expect((await queryRunner.getTable(VERSION_TABLE))?.foreignKeys).toEqual([
      expect.objectContaining({
        columnNames: ['connectorDefinitionId'],
        referencedTableName: DEFINITION_TABLE,
        referencedColumnNames: ['id'],
      }),
    ]);
  });

  /**
   * The entities and this migration have to describe the SAME schema.
   *
   * Nothing enforces that at runtime: the app runs migrations and never synchronizes, so a
   * unique index or a foreign key the migration creates but no entity declares works
   * perfectly -- right up until someone runs `migration:generate`. That command diffs entity
   * metadata against the live schema and writes whatever it takes to make the database match
   * the ENTITIES, so an object only the migration knows about is emitted as a DROP in the
   * next migration anyone generates, silently taking the guard with it. Nobody reviewing that
   * migration would see a bug: dropping an index no entity declares looks like tidying up.
   *
   * synchronize() applies exactly that diff, which makes the failure reproducible here. The
   * assertion is on what SURVIVES rather than on the diff being empty, because the diff is
   * never empty on SQLite -- every migration in this repo writes `CURRENT_TIMESTAMP` where
   * the SQLite driver renders `datetime('now')` for @CreateDateColumn, so the whole table is
   * rebuilt either way. A rebuild that carries the guards through is fine; one that loses
   * them is the bug. Deleting either the unique index or the @ManyToOne from
   * ConnectorDefinitionVersion turns this red.
   */
  it('keeps its guards when the schema is regenerated from the entities', async () => {
    await migration.up(queryRunner);

    await dataSource.synchronize();

    expect(await indexNames(queryRunner, VERSION_TABLE)).toEqual([
      'IDX_connector_definition_version_definitionId',
      'IDX_connector_definition_version_definitionId_version',
    ]);
    expect(await indexNames(queryRunner, DEFINITION_TABLE)).toEqual([
      'IDX_connector_definition_projectId',
      'IDX_connector_definition_projectId_name',
    ]);
    expect((await queryRunner.getTable(VERSION_TABLE))?.foreignKeys).toEqual([
      expect.objectContaining({
        columnNames: ['connectorDefinitionId'],
        referencedTableName: DEFINITION_TABLE,
        referencedColumnNames: ['id'],
      }),
    ]);

    // The names above are only labels; these are the guarantees they stand for.
    await queryRunner.query(
      `INSERT INTO ${DEFINITION_TABLE} (id, projectId, name, title) VALUES (?, ?, ?, ?)`,
      ['def-1', 'project-1', 'MyCustom', 'My Custom']
    );
    await queryRunner.query(
      `INSERT INTO ${VERSION_TABLE} (id, connectorDefinitionId, version, manifest, status) VALUES (?, ?, ?, ?, ?)`,
      ['ver-1', 'def-1', 1, '{}', 'draft']
    );
    await expect(
      queryRunner.query(
        `INSERT INTO ${VERSION_TABLE} (id, connectorDefinitionId, version, manifest, status) VALUES (?, ?, ?, ?, ?)`,
        ['ver-2', 'def-1', 1, '{}', 'draft']
      )
    ).rejects.toThrow(/UNIQUE/i);
    await expect(
      queryRunner.query(
        `INSERT INTO ${VERSION_TABLE} (id, connectorDefinitionId, version, manifest, status) VALUES (?, ?, ?, ?, ?)`,
        ['ver-orphan', 'definition-that-never-existed', 1, '{}', 'draft']
      )
    ).rejects.toThrow(/FOREIGN KEY/i);
  });

  it('refuses a version row that points at no connector definition', async () => {
    await migration.up(queryRunner);

    await expect(
      queryRunner.query(
        `INSERT INTO ${VERSION_TABLE} (id, connectorDefinitionId, version, manifest, status) VALUES (?, ?, ?, ?, ?)`,
        ['ver-orphan', 'definition-that-never-existed', 1, '{}', 'draft']
      )
    ).rejects.toThrow(/FOREIGN KEY/i);
  });

  it('refuses two rows with the same (connectorDefinitionId, version)', async () => {
    await migration.up(queryRunner);
    await queryRunner.query(
      `INSERT INTO ${DEFINITION_TABLE} (id, projectId, name, title) VALUES (?, ?, ?, ?)`,
      ['def-1', 'project-1', 'MyCustom', 'My Custom']
    );
    await queryRunner.query(
      `INSERT INTO ${VERSION_TABLE} (id, connectorDefinitionId, version, manifest, status) VALUES (?, ?, ?, ?, ?)`,
      ['ver-1', 'def-1', 1, '{}', 'draft']
    );

    await expect(
      queryRunner.query(
        `INSERT INTO ${VERSION_TABLE} (id, connectorDefinitionId, version, manifest, status) VALUES (?, ?, ?, ?, ?)`,
        ['ver-2', 'def-1', 1, '{}', 'draft']
      )
    ).rejects.toThrow(/UNIQUE/i);
  });

  it('is re-runnable: a second up() is a no-op instead of throwing', async () => {
    await migration.up(queryRunner);
    const before = await schemaObjects(queryRunner);

    await expect(migration.up(queryRunner)).resolves.toBeUndefined();

    expect(await schemaObjects(queryRunner)).toEqual(before);
  });

  it('re-runs after a crash between the two createTable calls', async () => {
    await expect(migration.up(crashOnDdlCall(queryRunner, 'createTable', 2))).rejects.toThrow(
      'pod terminated mid-migration'
    );
    expect(await queryRunner.hasTable(DEFINITION_TABLE)).toBe(true);
    expect(await queryRunner.hasTable(VERSION_TABLE)).toBe(false);

    // The next pod re-runs the same migration from the top: it must finish the job.
    await expect(migration.up(queryRunner)).resolves.toBeUndefined();

    expect(await queryRunner.hasTable(VERSION_TABLE)).toBe(true);
    expect(await indexNames(queryRunner, DEFINITION_TABLE)).toEqual([
      'IDX_connector_definition_projectId',
      'IDX_connector_definition_projectId_name',
    ]);
  });

  // A crash AFTER createTable is the case hasTable() alone cannot cover: the table is
  // already committed, so a re-run that keys every index off "does the table exist?"
  // skips the whole block and leaves the table without the constraints it was given.
  it('re-runs after a crash between createTable and the first createIndex', async () => {
    await expect(migration.up(crashOnDdlCall(queryRunner, 'createIndex', 1))).rejects.toThrow(
      'pod terminated mid-migration'
    );
    expect(await queryRunner.hasTable(DEFINITION_TABLE)).toBe(true);
    expect(await indexNames(queryRunner, DEFINITION_TABLE)).toEqual([]);

    await expect(migration.up(queryRunner)).resolves.toBeUndefined();

    expect(await indexNames(queryRunner, DEFINITION_TABLE)).toEqual([
      'IDX_connector_definition_projectId',
      'IDX_connector_definition_projectId_name',
    ]);
  });

  it('restores the unique connector name guard after a crash before its index', async () => {
    await expect(migration.up(crashOnDdlCall(queryRunner, 'createIndex', 2))).rejects.toThrow(
      'pod terminated mid-migration'
    );

    await expect(migration.up(queryRunner)).resolves.toBeUndefined();

    await queryRunner.query(
      `INSERT INTO ${DEFINITION_TABLE} (id, projectId, name, title) VALUES (?, ?, ?, ?)`,
      ['def-1', 'project-1', 'MyCustom', 'My Custom']
    );
    await expect(
      queryRunner.query(
        `INSERT INTO ${DEFINITION_TABLE} (id, projectId, name, title) VALUES (?, ?, ?, ?)`,
        ['def-2', 'project-1', 'MyCustom', 'Same name, same project']
      )
    ).rejects.toThrow(/UNIQUE/i);
  });

  it('restores the version uniqueness guard after a crash before its indexes', async () => {
    await expect(migration.up(crashOnDdlCall(queryRunner, 'createIndex', 3))).rejects.toThrow(
      'pod terminated mid-migration'
    );
    expect(await queryRunner.hasTable(VERSION_TABLE)).toBe(true);
    expect(await indexNames(queryRunner, VERSION_TABLE)).toEqual([]);

    await expect(migration.up(queryRunner)).resolves.toBeUndefined();

    expect(await indexNames(queryRunner, VERSION_TABLE)).toEqual([
      'IDX_connector_definition_version_definitionId',
      'IDX_connector_definition_version_definitionId_version',
    ]);
    await queryRunner.query(
      `INSERT INTO ${DEFINITION_TABLE} (id, projectId, name, title) VALUES (?, ?, ?, ?)`,
      ['def-1', 'project-1', 'MyCustom', 'My Custom']
    );
    await queryRunner.query(
      `INSERT INTO ${VERSION_TABLE} (id, connectorDefinitionId, version, manifest, status) VALUES (?, ?, ?, ?, ?)`,
      ['ver-1', 'def-1', 1, '{}', 'draft']
    );
    await expect(
      queryRunner.query(
        `INSERT INTO ${VERSION_TABLE} (id, connectorDefinitionId, version, manifest, status) VALUES (?, ?, ?, ?, ?)`,
        ['ver-2', 'def-1', 1, '{}', 'draft']
      )
    ).rejects.toThrow(/UNIQUE/i);
  });

  it('re-runs after a crash between the version indexes and the foreign key', async () => {
    await expect(migration.up(crashOnDdlCall(queryRunner, 'createForeignKey', 1))).rejects.toThrow(
      'pod terminated mid-migration'
    );
    expect(await queryRunner.hasTable(VERSION_TABLE)).toBe(true);
    expect((await queryRunner.getTable(VERSION_TABLE))?.foreignKeys).toEqual([]);

    await expect(migration.up(queryRunner)).resolves.toBeUndefined();

    expect((await queryRunner.getTable(VERSION_TABLE))?.foreignKeys).toEqual([
      expect.objectContaining({
        columnNames: ['connectorDefinitionId'],
        referencedTableName: DEFINITION_TABLE,
        referencedColumnNames: ['id'],
      }),
    ]);
    await expect(
      queryRunner.query(
        `INSERT INTO ${VERSION_TABLE} (id, connectorDefinitionId, version, manifest, status) VALUES (?, ?, ?, ?, ?)`,
        ['ver-orphan', 'definition-that-never-existed', 1, '{}', 'draft']
      )
    ).rejects.toThrow(/FOREIGN KEY/i);
  });

  it('survives up() -> down() -> up()', async () => {
    await migration.up(queryRunner);
    await migration.down(queryRunner);

    await expect(migration.up(queryRunner)).resolves.toBeUndefined();

    expect(await queryRunner.hasTable(DEFINITION_TABLE)).toBe(true);
    expect(await queryRunner.hasTable(VERSION_TABLE)).toBe(true);
    // softDropTable keeps the previous rows around instead of dropping them.
    expect(await queryRunner.hasTable(`${DEFINITION_TABLE}_backup`)).toBe(true);
    expect(await queryRunner.hasTable(`${VERSION_TABLE}_backup`)).toBe(true);
    expect(await indexNames(queryRunner, VERSION_TABLE)).toEqual([
      'IDX_connector_definition_version_definitionId',
      'IDX_connector_definition_version_definitionId_version',
    ]);
  });

  it('down() is idempotent when the tables are already gone', async () => {
    await migration.up(queryRunner);
    await migration.down(queryRunner);

    await expect(migration.down(queryRunner)).resolves.toBeUndefined();
  });

  /**
   * Both version indexes cover `connectorDefinitionId`, and so does the foreign key. MySQL
   * requires an index whose leftmost prefix covers a foreign key's columns for as long as
   * that key exists, so dropping them while the key still stands makes whichever goes
   * second the last one covering it: ERROR 1553, "Cannot drop index ...: needed in a
   * foreign key constraint". down() then aborts half-way with one index already gone, and
   * TypeORM deletes the migrations row only after down() resolves -- so the row survives
   * and no re-run ever repairs the schema.
   *
   * The error itself cannot be reproduced here: this suite runs SQLite, where TypeORM
   * rebuilds the whole table to change a foreign key and never issues the bare
   * `ALTER TABLE ... DROP INDEX` that MySQL rejects. Reproducing 1553 would take a
   * MySQL-backed migration run. What actually prevents it is the order of operations, so
   * that is what is pinned down here.
   */
  it('drops the version foreign key before the indexes MySQL needs it to keep', async () => {
    await migration.up(queryRunner);
    const calls: Array<{ method: DropMethod; table: string }> = [];

    await migration.down(recordDropCalls(queryRunner, calls));

    const onVersionTable = calls.filter(call => call.table === VERSION_TABLE);
    const lastForeignKeyDrop = onVersionTable
      .map(call => call.method)
      .lastIndexOf('dropForeignKey');
    const firstIndexDrop = onVersionTable.findIndex(call => call.method === 'dropIndex');

    // The foreign key is dropped at all...
    expect(lastForeignKeyDrop).toBeGreaterThan(-1);
    // ...the indexes still are too...
    expect(firstIndexDrop).toBeGreaterThan(-1);
    // ...and no index is ever dropped while a key that needs it is still standing.
    expect(lastForeignKeyDrop).toBeLessThan(firstIndexDrop);
  });

  it('leaves no foreign key behind on the renamed backup table', async () => {
    await migration.up(queryRunner);

    await migration.down(queryRunner);

    expect((await queryRunner.getTable(`${VERSION_TABLE}_backup`))?.foreignKeys).toEqual([]);
  });
});

describe('ConnectorDefinitionService atomicity on the real schema', () => {
  const migration = new CreateConnectorDefinitionTables1788048000000();
  let dataSource: DataSource;
  let definitionRepo: Repository<ConnectorDefinition>;
  let versionRepo: Repository<ConnectorDefinitionVersion>;
  let service: ConnectorDefinitionService;

  beforeAll(() => {
    initializeTransactionalContext({ storageDriver: StorageDriver.AUTO });
  });

  beforeEach(async () => {
    dataSource = await createSqliteDataSource();
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await migration.up(queryRunner);
    await queryRunner.release();

    // Order matters: the repositories must be created after the data source is patched,
    // otherwise they never resolve the transactional entity manager from the CLS context.
    deleteDataSourceByName('default');
    addTransactionalDataSource(dataSource);
    definitionRepo = dataSource.getRepository(ConnectorDefinition);
    versionRepo = dataSource.getRepository(ConnectorDefinitionVersion);
    service = new ConnectorDefinitionService(definitionRepo, versionRepo, {
      findByProjectIdAndDefinitionType: jest.fn().mockResolvedValue([]),
    } as never);
  });

  afterEach(async () => {
    deleteDataSourceByName('default');
    await dataSource.destroy();
  });

  it('create() persists the definition and its first draft version', async () => {
    const definition = await service.create('project-1', 'user-1', {
      name: 'MyCustom',
      title: 'My Custom',
      manifest: VALID_MANIFEST,
    });

    await expect(definitionRepo.count()).resolves.toBe(1);
    const versions = await versionRepo.find({ where: { connectorDefinitionId: definition.id } });
    expect(versions).toHaveLength(1);
    expect(versions[0].version).toBe(1);
    expect(versions[0].status).toBe(ConnectorDefinitionVersionStatus.DRAFT);
  });

  it('create() leaves nothing behind when the version insert fails', async () => {
    jest.spyOn(versionRepo, 'save').mockRejectedValueOnce(new Error('connection reset'));

    await expect(
      service.create('project-1', 'user-1', {
        name: 'MyCustom',
        title: 'My Custom',
        manifest: VALID_MANIFEST,
      })
    ).rejects.toThrow('connection reset');

    await expect(definitionRepo.count({ withDeleted: true })).resolves.toBe(0);
    await expect(versionRepo.count()).resolves.toBe(0);
  });

  it('create() does not burn the connector name when the version insert fails', async () => {
    jest.spyOn(versionRepo, 'save').mockRejectedValueOnce(new Error('connection reset'));
    await expect(
      service.create('project-1', 'user-1', {
        name: 'MyCustom',
        title: 'My Custom',
        manifest: VALID_MANIFEST,
      })
    ).rejects.toThrow('connection reset');

    // The retry has to succeed, and it only can if the rollback left NO row behind -- not
    // even a soft-deleted one, because assertNameAvailable() would still see that. Note
    // this does not exercise `withDeleted` itself: a rolled-back insert is absent either
    // way. What the flag actually does is pinned by the soft-delete test below.
    const retried = await service.create('project-1', 'user-1', {
      name: 'MyCustom',
      title: 'My Custom',
      manifest: VALID_MANIFEST,
    });

    expect(retried.id).toBeDefined();
    await expect(definitionRepo.count()).resolves.toBe(1);
    await expect(versionRepo.count()).resolves.toBe(1);
  });

  /**
   * A soft-deleted connector keeps its name reserved, so a new connector can never collide
   * with a tombstone. Only a real database can prove that. `withDeleted: true` is an
   * instruction to the driver about which rows to hand back, and a repository double can at
   * most agree with whatever its author believed the instruction meant -- pin the contract
   * against a double and you are testing the double. Here the `deletedAt` column, the
   * soft-delete UPDATE and the `withDeleted` lookup are all TypeORM's own, running on the
   * schema the migration builds, so the row that comes back is the row production gets.
   *
   * Dropping `withDeleted: true` from assertNameAvailable() turns this red -- and red in a
   * way only the real schema can show: the guard waves the name through and the unique
   * index on (projectId, name), which counts tombstones too, rejects the INSERT instead.
   * The caller gets a raw driver error rather than this endpoint's documented 400.
   */
  it('create() keeps the name of a soft-deleted connector reserved', async () => {
    const definition = await service.create('project-1', 'user-1', {
      name: 'MyCustom',
      title: 'My Custom',
      manifest: VALID_MANIFEST,
    });

    await service.softDelete('project-1', definition.id);

    // Invisible to every ordinary read...
    await expect(definitionRepo.count()).resolves.toBe(0);
    // ...but still on disk, which is the only reason the name is still taken.
    await expect(definitionRepo.count({ withDeleted: true })).resolves.toBe(1);

    await expect(
      service.create('project-1', 'user-1', {
        name: 'MyCustom',
        title: 'Second Attempt',
        manifest: VALID_MANIFEST,
      })
    ).rejects.toThrow(/already exists in this project/);

    // And the refused create left nothing behind either.
    await expect(definitionRepo.count({ withDeleted: true })).resolves.toBe(1);
    await expect(versionRepo.count()).resolves.toBe(1);
  });

  /**
   * `connector_publish {name, title, manifest}` is one operation to its caller, and an
   * assistant authoring a connector reaches it with a manifest it has never had validated:
   * `connector_test` only ever parses the ONE node it runs. Split across two transactions,
   * a manifest the parser rejects left the definition row committed and unpublishable --
   * and `assertNameAvailable()` searches `withDeleted: true`, so that row reserved the
   * connector's name for good. The obvious retry ("publish it again, correctly") then failed
   * with "already exists in this project" on a connector the caller cannot see.
   *
   * These run against the real schema because a rollback is the thing being asserted, and
   * only a real transaction can roll anything back.
   */
  describe('MCP connector_publish, creating and publishing in one call', () => {
    const INVALID_MANIFEST = { not: 'a manifest' } as Record<string, unknown>;
    const editor = { projectId: 'project-1', userId: 'user-1', roles: ['editor'] };
    let facade: McpConnectorAuthoringFacadeImpl;

    beforeEach(() => {
      facade = new McpConnectorAuthoringFacadeImpl({} as never, service);
    });

    it('leaves nothing behind when the manifest fails to publish', async () => {
      await expect(
        facade.publishConnector({
          ...editor,
          name: 'MyCustom',
          title: 'My Custom',
          manifest: INVALID_MANIFEST,
        })
      ).rejects.toThrow(/Invalid connector manifest/);

      await expect(definitionRepo.count({ withDeleted: true })).resolves.toBe(0);
      await expect(versionRepo.count()).resolves.toBe(0);
    });

    it('keeps the connector name free for the corrected retry', async () => {
      await expect(
        facade.publishConnector({
          ...editor,
          name: 'MyCustom',
          title: 'My Custom',
          manifest: INVALID_MANIFEST,
        })
      ).rejects.toThrow(/Invalid connector manifest/);

      const published = await facade.publishConnector({
        ...editor,
        name: 'MyCustom',
        title: 'My Custom',
        manifest: VALID_MANIFEST,
      });

      expect(published).toMatchObject({
        name: 'MyCustom',
        version: 1,
        status: ConnectorDefinitionVersionStatus.PUBLISHED,
      });
    });

    it('publishes and activates the first version when the manifest is valid', async () => {
      const published = await facade.publishConnector({
        ...editor,
        name: 'MyCustom',
        title: 'My Custom',
        manifest: VALID_MANIFEST,
      });

      const definition = await definitionRepo.findOneOrFail({
        where: { id: published.connectorId },
      });
      const version = await versionRepo.findOneOrFail({
        where: { connectorDefinitionId: definition.id },
      });
      expect(definition.activeVersionId).toBe(version.id);
      expect(version.status).toBe(ConnectorDefinitionVersionStatus.PUBLISHED);
      expect(version.publishedAt).not.toBeNull();
    });

    /**
     * The update shape (connector_id + manifest) is deliberately NOT atomic the same way:
     * the connector already exists, so a rejected manifest costs only an unpublished draft
     * that the next call overwrites, and rolling the draft back would throw away the work
     * the caller just sent while leaving them nothing to correct.
     */
    it('keeps the rejected manifest as a draft when publishing over an existing connector', async () => {
      const published = await facade.publishConnector({
        ...editor,
        name: 'MyCustom',
        title: 'My Custom',
        manifest: VALID_MANIFEST,
      });

      await expect(
        facade.publishConnector({
          ...editor,
          connectorId: published.connectorId,
          manifest: INVALID_MANIFEST,
        })
      ).rejects.toThrow(/Invalid connector manifest/);

      const versions = await versionRepo.find({
        where: { connectorDefinitionId: published.connectorId },
        order: { version: 'ASC' },
      });
      expect(versions).toHaveLength(2);
      expect(versions[1].status).toBe(ConnectorDefinitionVersionStatus.DRAFT);
      expect(versions[1].manifest).toEqual(INVALID_MANIFEST);
      // ...and the connector still serves the version it was serving before.
      const definition = await definitionRepo.findOneOrFail({
        where: { id: published.connectorId },
      });
      expect(definition.activeVersionId).toBe(versions[0].id);
    });
  });

  it('publish() rolls the version back to draft when activating it fails', async () => {
    const definition = await service.create('project-1', 'user-1', {
      name: 'MyCustom',
      title: 'My Custom',
      manifest: VALID_MANIFEST,
    });
    jest.spyOn(definitionRepo, 'save').mockRejectedValueOnce(new Error('connection reset'));

    await expect(service.publish('project-1', definition.id)).rejects.toThrow('connection reset');

    const version = await versionRepo.findOneOrFail({
      where: { connectorDefinitionId: definition.id },
    });
    expect(version.status).toBe(ConnectorDefinitionVersionStatus.DRAFT);
    expect(version.publishedAt).toBeNull();
    await expect(
      definitionRepo.findOneOrFail({ where: { id: definition.id } })
    ).resolves.toMatchObject({ activeVersionId: null });
  });
});
