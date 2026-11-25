import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { DataSource, EntitySubscriberInterface, InsertEvent } from 'typeorm';
import {
  addTransactionalDataSource,
  initializeTransactionalContext,
  StorageDriver,
} from 'typeorm-transactional';
import { PLUGIN_COLLECTIONS_DATA_SOURCE } from 'src/config/plugin-collections-data-source-options.config';
import type { ResolvedPluginCollection } from 'src/plugin-host/collections/dto/domain/plugin-collection.types';
import { PluginCollectionAuditEvent } from 'src/plugin-host/collections/entities/plugin-collection-audit-event.collection.entity';
import { PluginCollectionDocument } from 'src/plugin-host/collections/entities/plugin-collection-document.collection.entity';
import { PluginCollectionUsage } from 'src/plugin-host/collections/entities/plugin-collection-usage.collection.entity';
import { PluginCollectionMapper } from 'src/plugin-host/collections/mappers/plugin-collection.mapper';
import { CreatePluginCollectionTables1785931300000 } from 'src/plugin-host/collections/migrations/1785931300000-create-plugin-collection-tables';
import { PluginCollectionAuditService } from 'src/plugin-host/collections/services/plugin-collection-audit.service';
import type { PluginCollectionAuthorizationService } from 'src/plugin-host/collections/services/plugin-collection-authorization.service';
import { PluginCollectionPersistenceService } from 'src/plugin-host/collections/services/plugin-collection-persistence.service';
import { PluginCollectionQuotaService } from 'src/plugin-host/collections/services/plugin-collection-quota.service';

const MYSQL_HOST = process.env.PLUGIN_COLLECTIONS_MYSQL_HOST;
const MYSQL_PORT = parseInt(process.env.PLUGIN_COLLECTIONS_MYSQL_PORT ?? '3306', 10);
const MYSQL_USER = process.env.PLUGIN_COLLECTIONS_MYSQL_USER ?? 'root';
const MYSQL_PASSWORD = process.env.PLUGIN_COLLECTIONS_MYSQL_PASSWORD;
const MYSQL_DATABASE = process.env.PLUGIN_COLLECTIONS_MYSQL_DATABASE ?? 'owox_test';

const available = !!MYSQL_HOST;
if (!available) {
  console.log(
    'Skipping plugin collections MySQL integration tests: PLUGIN_COLLECTIONS_MYSQL_HOST unset'
  );
}
if (available && !MYSQL_PASSWORD) {
  throw new Error(
    'PLUGIN_COLLECTIONS_MYSQL_HOST is set but PLUGIN_COLLECTIONS_MYSQL_PASSWORD is empty.'
  );
}

const describeIfAvailable = available ? describe : describe.skip;

const TABLES = [
  'plugin_collection_audit_event',
  'plugin_collection_usage',
  'plugin_collection_document',
  'plugin_collections_migrations',
];
const PROJECT_ID = 'project-1';
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describeIfAvailable('Plugin collections storage (integration, MySQL)', () => {
  let dataSource: DataSource;
  let service: PluginCollectionPersistenceService;
  // An armed point holds each write until a second write arrives there (or 1 s passes).
  type Point = 'after usage insert' | 'before document insert' | 'before audit insert';
  const barriers = new Map<
    Point,
    { arrived: Set<unknown>; release: () => void; gate: Promise<void> }
  >();
  const arm = (...points: Point[]) => {
    for (const point of points) {
      let release!: () => void;
      const gate = new Promise<void>(resolve => (release = resolve));
      barriers.set(point, { arrived: new Set(), release, gate });
    }
  };
  const hold = async (point: Point, queryRunner: unknown) => {
    const barrier = barriers.get(point);
    if (!barrier) return;
    barrier.arrived.add(queryRunner);
    if (barrier.arrived.size === 2) barrier.release();
    await Promise.race([barrier.gate, new Promise(resolve => setTimeout(resolve, 1000))]);
  };

  beforeAll(async () => {
    initializeTransactionalContext({ storageDriver: StorageDriver.AUTO });
    dataSource = new DataSource({
      type: 'mysql',
      host: MYSQL_HOST,
      port: MYSQL_PORT,
      username: MYSQL_USER,
      password: MYSQL_PASSWORD!,
      database: MYSQL_DATABASE,
      entities: [PluginCollectionDocument, PluginCollectionUsage, PluginCollectionAuditEvent],
      migrations: [CreatePluginCollectionTables1785931300000],
      migrationsTableName: 'plugin_collections_migrations',
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();
    for (const table of TABLES) await dataSource.query(`DROP TABLE IF EXISTS \`${table}\``);
    await dataSource.runMigrations();
    addTransactionalDataSource({ name: PLUGIN_COLLECTIONS_DATA_SOURCE, dataSource });
    dataSource.subscribers.push({
      afterInsert: async (event: InsertEvent<unknown>) => {
        if (event.metadata.target === PluginCollectionUsage) {
          await hold('after usage insert', event.queryRunner);
        }
      },
      beforeInsert: async (event: InsertEvent<unknown>) => {
        if (event.metadata.target === PluginCollectionDocument) {
          await hold('before document insert', event.queryRunner);
        }
        if (event.metadata.target === PluginCollectionAuditEvent) {
          await hold('before audit insert', event.queryRunner);
        }
      },
    } as EntitySubscriberInterface);
    service = new PluginCollectionPersistenceService(
      dataSource.getRepository(PluginCollectionDocument),
      dataSource.getRepository(PluginCollectionUsage),
      dataSource,
      { assertAllowed: async () => undefined } as unknown as PluginCollectionAuthorizationService,
      new PluginCollectionAuditService(dataSource.getRepository(PluginCollectionAuditEvent)),
      new PluginCollectionMapper(),
      new PluginCollectionQuotaService()
    );
  }, 60_000);

  afterEach(async () => {
    barriers.clear();
    // TRUNCATE, not DELETE: rows marked for purge would split the index gaps.
    for (const table of TABLES.slice(0, 3)) await dataSource.query(`TRUNCATE TABLE \`${table}\``);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      for (const table of TABLES) {
        await dataSource.query(`DROP TABLE IF EXISTS \`${table}\``).catch(() => undefined);
      }
      await dataSource.destroy();
    }
  }, 30_000);

  const collection = (
    pluginId: string,
    name: string,
    projectId: string
  ): ResolvedPluginCollection => ({
    declaration: { name, scope: 'project' },
    semver: '1.0.0',
    namespaceKey: sha256(`${pluginId}:${projectId}:${name}`),
    memberId: null,
  });

  const put = (pluginId: string, name: string, documentId: string, projectId = PROJECT_ID) =>
    service.put(collection(pluginId, name, projectId), {
      collectionName: name,
      documentId,
      document: { documentId },
      parentId: null,
      context: {
        userId: 'user-1',
        projectId,
        roles: ['admin'],
        pluginId,
        installationId: `installation-${pluginId}`,
      },
    });

  it.each([
    ['one plugin, one collection', ['plugin-a', 'grid-columns'], ['plugin-a', 'grid-columns']],
    ['two plugins in one project', ['plugin-a', 'grid-columns'], ['plugin-b', 'decisions']],
  ])(
    'serializes concurrent writes of different documents (%s) without a deadlock',
    async (_case, [pluginA, nameA], [pluginB, nameB]) => {
      // Usage rows already exist, as for every write after the first one in production.
      await put(pluginA, nameA, 'seed-a');
      await put(pluginB, nameB, 'seed-b');

      arm('after usage insert');
      const results = await Promise.allSettled([
        put(pluginA, nameA, 'doc-a'),
        put(pluginB, nameB, 'doc-b'),
      ]);

      expect(results.map(result => (result.status === 'rejected' ? result.reason : 'ok'))).toEqual([
        'ok',
        'ok',
      ]);
      const project = await dataSource
        .getRepository(PluginCollectionUsage)
        .findOneByOrFail({ usageKey: sha256(`project:${PROJECT_ID}`) });
      expect(project.documentCount).toBe(4);
    },
    30_000
  );

  it('creates new documents in two projects at once without a deadlock', async () => {
    // Empty tables, as on a new installation: the new keys share one index gap.
    arm('before document insert', 'before audit insert');
    const results = await Promise.allSettled([
      put('plugin-a', 'grid-columns', 'doc-1', 'project-1'),
      put('plugin-a', 'grid-columns', 'doc-2', 'project-2'),
    ]);

    expect(results.map(result => (result.status === 'rejected' ? result.reason : 'ok'))).toEqual([
      'ok',
      'ok',
    ]);
    expect(await dataSource.getRepository(PluginCollectionDocument).count()).toBe(2);
    expect(await dataSource.getRepository(PluginCollectionAuditEvent).count()).toBe(2);
  }, 30_000);
});
