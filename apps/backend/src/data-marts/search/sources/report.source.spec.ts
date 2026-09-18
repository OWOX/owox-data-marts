import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ReportIndexableSource } from './report.source';
import { SearchIndexRepository } from '../schema/search-index.repository';
import { InMemoryPaginatedSearch } from '../engine/in-memory-paginated.search';
import { buildDocument } from '../indexing/document-builder';
import { IndexableSourceRegistry } from './indexable-source.registry';
import { Report } from '../../entities/report.entity';
import { ReportOwner } from '../../entities/report-owner.entity';
import { ReportSearchIndex } from '../../entities/search/report-search-index.entity';
import { DataDestination } from '../../entities/data-destination.entity';
import { DataDestinationCredential } from '../../entities/data-destination-credential.entity';
import { DestinationOwner } from '../../entities/destination-owner.entity';
import { DestinationContext } from '../../entities/destination-context.entity';
import { Context } from '../../entities/context.entity';
import { MemberRoleContext } from '../../entities/member-role-context.entity';
import { DataMart } from '../../entities/data-mart.entity';
import { DataStorage } from '../../entities/data-storage.entity';
import { DataStorageCredential } from '../../entities/data-storage-credential.entity';
import { DataMartContext } from '../../entities/data-mart-context.entity';
import { DataMartBusinessOwner } from '../../entities/data-mart-business-owner.entity';
import { DataMartTechnicalOwner } from '../../entities/data-mart-technical-owner.entity';
import { DataMartRelationship } from '../../entities/data-mart-relationship.entity';
import { ConnectorState } from '../../entities/connector-state.entity';
import { StorageOwner } from '../../entities/storage-owner.entity';
import { StorageContext } from '../../entities/storage-context.entity';
import {
  DataDestinationType,
  toHumanReadable,
} from '../../data-destination-types/enums/data-destination-type.enum';
import { GoogleSheetsConfigType } from '../../data-destination-types/google-sheets/schemas/google-sheets-config.schema';
import { LookerStudioConnectorConfigType } from '../../data-destination-types/looker-studio-connector/schemas/looker-studio-connector-config.schema';
import { DataMartStatus } from '../../enums/data-mart-status.enum';
import { DataStorageType } from '../../data-storage-types/enums/data-storage-type.enum';
import { RoleScope } from '../../enums/role-scope.enum';
import { ContextAccessService } from '../../services/context/context-access.service';
import { SearchableEntityType } from '../../../common/search/search.facade';
import type { PageCursor, SourceAccessScope } from './indexable-source.port';
import { describeLoadSearchableOneContract } from './indexable-source.contract';
import { SearchIndexerService } from '../indexing/search-indexer.service';
import type { AdvancedSearchConfig } from '../config/advanced-search.config';
import type { EmbeddingProvider } from '../embedding/embedding-provider';

const TEST_ENTITIES = [
  DataMart,
  DataStorage,
  DataStorageCredential,
  DataMartContext,
  DataMartBusinessOwner,
  DataMartTechnicalOwner,
  DataMartRelationship,
  ConnectorState,
  Context,
  StorageOwner,
  StorageContext,
  MemberRoleContext,
  DataDestination,
  DataDestinationCredential,
  DestinationOwner,
  DestinationContext,
  Report,
  ReportOwner,
  ReportSearchIndex,
];

const STUB_EMBEDDING = Buffer.from(new Float32Array([1, 0]).buffer);

describe('ReportIndexableSource', () => {
  let module: TestingModule;
  let dataSource: DataSource;
  let source: ReportIndexableSource;
  let indexRepo: SearchIndexRepository;
  let reportRepo: Repository<Report>;
  let martRepo: Repository<DataMart>;
  let storageRepo: Repository<DataStorage>;
  let destinationRepo: Repository<DataDestination>;
  let contextRepo: Repository<Context>;
  const getRoleScope = jest.fn<Promise<RoleScope>, [string, string]>();

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: TEST_ENTITIES,
          synchronize: true,
          logging: false,
        }),
        TypeOrmModule.forFeature([Report, DataMart, DataStorage, DataDestination, Context]),
      ],
      providers: [
        ReportIndexableSource,
        SearchIndexRepository,
        { provide: ContextAccessService, useValue: { getRoleScope } },
      ],
    }).compile();

    dataSource = module.get(getDataSourceToken());
    source = module.get(ReportIndexableSource);
    indexRepo = module.get(SearchIndexRepository);
    reportRepo = module.get(getRepositoryToken(Report));
    martRepo = module.get(getRepositoryToken(DataMart));
    storageRepo = module.get(getRepositoryToken(DataStorage));
    destinationRepo = module.get(getRepositoryToken(DataDestination));
    contextRepo = module.get(getRepositoryToken(Context));
  }, 30_000);

  afterAll(async () => {
    await module.close();
  });

  afterEach(async () => {
    await dataSource.query('DELETE FROM report_search_index');
    await dataSource.query('DELETE FROM report_owners');
    await dataSource.query('DELETE FROM report');
    await dataSource.query('DELETE FROM member_role_contexts');
    await dataSource.query('DELETE FROM destination_contexts');
    await dataSource.query('DELETE FROM destination_owners');
    await dataSource.query('DELETE FROM data_mart_contexts');
    await dataSource.query('DELETE FROM data_mart_technical_owners');
    await dataSource.query('DELETE FROM data_mart_business_owners');
    await dataSource.query('DELETE FROM context');
    await dataSource.query('DELETE FROM data_destination');
    await dataSource.query('DELETE FROM data_mart');
    await dataSource.query('DELETE FROM data_storage');
  });

  beforeEach(() => {
    getRoleScope.mockReset();
    getRoleScope.mockResolvedValue(RoleScope.ENTIRE_PROJECT);
  });

  async function seedMart(
    overrides: Partial<DataMart> = {},
    projectId = 'proj-1'
  ): Promise<DataMart> {
    const storage = storageRepo.create();
    storage.type = DataStorageType.GOOGLE_BIGQUERY;
    storage.projectId = projectId;
    storage.createdById = 'user-1';
    const savedStorage = await storageRepo.save(storage);

    const mart = martRepo.create();
    mart.title = 'Orders';
    mart.projectId = projectId;
    mart.status = DataMartStatus.PUBLISHED;
    mart.createdById = 'user-1';
    mart.storage = savedStorage;
    Object.assign(mart, overrides);
    return martRepo.save(mart);
  }

  async function seedDestination(
    overrides: Partial<DataDestination> = {},
    projectId = 'proj-1'
  ): Promise<DataDestination> {
    const destination = destinationRepo.create();
    destination.title = 'Finance Sheets';
    destination.type = DataDestinationType.GOOGLE_SHEETS;
    destination.projectId = projectId;
    destination.createdById = 'user-1';
    destination.availableForUse = true;
    destination.availableForMaintenance = false;
    Object.assign(destination, overrides);
    return destinationRepo.save(destination);
  }

  async function seedReport(
    mart: DataMart,
    destination: DataDestination,
    overrides: Partial<Report> = {}
  ): Promise<Report> {
    const report = reportRepo.create();
    report.title = 'Monthly revenue';
    report.dataMart = mart;
    report.dataDestination = destination;
    report.createdById = 'user-1';
    report.destinationConfig = {
      type: GoogleSheetsConfigType,
      spreadsheetId: 'spreadsheet-1',
      sheetId: 0,
    };
    Object.assign(report, overrides);
    return reportRepo.save(report);
  }

  async function seedReportOnMart(
    martOverrides: Partial<DataMart> = {},
    destinationOverrides: Partial<DataDestination> = {}
  ): Promise<Report> {
    const mart = await seedMart(martOverrides);
    const destination = await seedDestination(destinationOverrides);
    return seedReport(mart, destination);
  }

  async function seedIndexRow(
    entityId: string,
    projectId = 'proj-1',
    document: string | null = null
  ): Promise<void> {
    await indexRepo.upsert(SearchableEntityType.REPORT, {
      entityId,
      projectId,
      isDraft: false,
      embedding: STUB_EMBEDDING,
      document,
      fieldCount: null,
      docHash: 'hash',
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    });
  }

  async function visibleIds(
    projectId: string,
    accessScope?: SourceAccessScope
  ): Promise<Set<string>> {
    const predicate = await source.accessPredicateProvider.build('idx', projectId, accessScope);
    const page = await indexRepo.searchCandidates(
      SearchableEntityType.REPORT,
      projectId,
      predicate,
      '',
      { candidateLimit: 1000 }
    );
    return new Set(page.rows.map(r => r.entityId));
  }

  describe('listSearchablePage projection', () => {
    it('ranks the report title above the data mart and destination titles', async () => {
      const mart = await seedMart({ title: 'Orders' });
      const destination = await seedDestination({ title: 'Finance Sheets' });
      const report = await seedReport(mart, destination, { title: 'Monthly revenue' });

      const page = await source.listSearchablePage('proj-1', null, 100);
      expect(page.descriptors).toHaveLength(1);
      const [descriptor] = page.descriptors;

      expect(descriptor.entityType).toBe(SearchableEntityType.REPORT);
      expect(descriptor.entityId).toBe(report.id);
      expect(descriptor.projectId).toBe('proj-1');
      expect(descriptor.title).toBe('Monthly revenue');
      expect(descriptor.description).toBeNull();
      expect(descriptor.fieldCount).toBe(0);
      expect(descriptor.isDraft).toBe(false);
      expect(descriptor.richTextSlots).toEqual([
        { kind: 'title', text: 'Monthly revenue' },
        { kind: 'context', text: 'Orders' },
        { kind: 'context', text: 'Finance Sheets' },
        { kind: 'context', text: toHumanReadable(DataDestinationType.GOOGLE_SHEETS) },
      ]);
      expect(descriptor.atomicTokenSlots).toEqual([]);
      expect(descriptor.embeddingText).toBe(
        [
          'Monthly revenue',
          'Orders',
          'Finance Sheets',
          toHumanReadable(DataDestinationType.GOOGLE_SHEETS),
        ].join('\n')
      );
    });

    it('carries data mart and destination references for consumers', async () => {
      const mart = await seedMart({ title: 'Orders' });
      const destination = await seedDestination({
        title: 'Weekly digest',
        type: DataDestinationType.EMAIL,
      });
      await seedReport(mart, destination);

      const [descriptor] = (await source.listSearchablePage('proj-1', null, 100)).descriptors;

      expect(descriptor.report).toEqual({
        dataMart: { id: mart.id, title: 'Orders' },
        dataDestination: {
          id: destination.id,
          title: 'Weekly digest',
          type: DataDestinationType.EMAIL,
        },
      });
    });

    it('uses the destination title as the display title for a Looker Studio report', async () => {
      const mart = await seedMart({ title: 'Orders' });
      const destination = await seedDestination({
        title: 'Looker',
        type: DataDestinationType.LOOKER_STUDIO,
      });
      await seedReport(mart, destination, {
        title: '',
        destinationConfig: { type: LookerStudioConnectorConfigType, cacheLifetime: 300 },
      });

      const [descriptor] = (await source.listSearchablePage('proj-1', null, 100)).descriptors;

      expect(descriptor.title).toBe('Looker');
      expect(descriptor.richTextSlots[0]).toEqual({ kind: 'title', text: 'Looker' });
      expect(descriptor.embeddingText).toBe(
        ['Looker', 'Orders', 'Looker', toHumanReadable(DataDestinationType.LOOKER_STUDIO)].join(
          '\n'
        )
      );
    });

    it('hydrates only the fields used by the report search descriptor', async () => {
      await seedReportOnMart();
      const findSpy = jest.spyOn(reportRepo, 'find');

      try {
        await source.listSearchablePage('proj-1', null, 100);

        expect(findSpy).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            select: {
              id: true,
              title: true,
              modifiedAt: true,
              dataMart: { id: true, title: true, projectId: true },
              dataDestination: { id: true, title: true, type: true },
            },
          })
        );
      } finally {
        findSpy.mockRestore();
      }
    });

    it('omits reports whose data mart is soft-deleted', async () => {
      const live = await seedReportOnMart({ title: 'Live mart' });
      const deleted = await seedReportOnMart({ title: 'Deleted mart' });
      await martRepo.softDelete(deleted.dataMart.id);

      const page = await source.listSearchablePage('proj-1', null, 100);
      expect(page.descriptors.map(d => d.entityId)).toEqual([live.id]);
    });

    it('scopes the page to the data mart project', async () => {
      const inProject = await seedReport(
        await seedMart({}, 'proj-1'),
        await seedDestination({}, 'proj-1')
      );
      await seedReport(await seedMart({}, 'proj-2'), await seedDestination({}, 'proj-2'));

      const page = await source.listSearchablePage('proj-1', null, 100);
      expect(page.descriptors.map(d => d.entityId)).toEqual([inProject.id]);
    });
  });

  describe('listSearchablePage pagination', () => {
    it('returns a cursor after a full page whose report has no destination', async () => {
      const mart = await seedMart();
      const destination = await seedDestination();
      await seedReport(mart, destination);

      await dataSource.query('PRAGMA foreign_keys = OFF');
      try {
        await dataSource.query('DELETE FROM data_destination WHERE id = ?', [destination.id]);
      } finally {
        await dataSource.query('PRAGMA foreign_keys = ON');
      }

      const page = await source.listSearchablePage('proj-1', null, 1);

      expect(page.descriptors).toEqual([]);
      expect(page.nextCursor).not.toBeNull();
    });

    it('paginates using the keyset cursor', async () => {
      const mart = await seedMart();
      const destination = await seedDestination();
      for (let i = 0; i < 5; i++) {
        await seedReport(mart, destination, { title: `Report ${i}` });
      }

      const collected: string[] = [];
      let cursor: PageCursor | null = null;
      do {
        const page = await source.listSearchablePage('proj-1', cursor, 2);
        for (const d of page.descriptors) collected.push(d.entityId);
        cursor = page.nextCursor;
      } while (cursor !== null);

      expect(collected).toHaveLength(5);
      expect(new Set(collected).size).toBe(5);
    });

    it('returns no cursor when the page is not full', async () => {
      await seedReportOnMart();

      const page = await source.listSearchablePage('proj-1', null, 10);
      expect(page.descriptors).toHaveLength(1);
      expect(page.nextCursor).toBeNull();
    });
  });

  describe('listProjectIds', () => {
    it('returns distinct project ids of reports on live data marts', async () => {
      await seedReport(await seedMart({}, 'proj-1'), await seedDestination({}, 'proj-1'));
      await seedReport(await seedMart({}, 'proj-1'), await seedDestination({}, 'proj-1'));
      await seedReport(await seedMart({}, 'proj-2'), await seedDestination({}, 'proj-2'));
      const orphaned = await seedReport(
        await seedMart({}, 'proj-deleted'),
        await seedDestination({}, 'proj-deleted')
      );
      await martRepo.softDelete(orphaned.dataMart.id);

      const ids = await source.listProjectIds();
      expect(ids.sort()).toEqual(['proj-1', 'proj-2']);
    });
  });

  describe('source metadata', () => {
    it('exposes the REPORT entity type', () => {
      expect(source.entityType).toBe(SearchableEntityType.REPORT);
    });
  });

  describeLoadSearchableOneContract(
    () => source,
    async () => {
      const live = await seedReportOnMart({ title: 'Contract live' });
      const deleted = await seedReportOnMart({ title: 'Contract deleted' });
      await martRepo.softDelete(deleted.dataMart.id);
      return { liveId: live.id, deletedId: deleted.id };
    },
    SearchableEntityType.REPORT
  );

  describe('access predicate parity with data mart and destination visibility', () => {
    it('returns only reports of live data marts without accessScope', async () => {
      const live = await seedReportOnMart();
      const deleted = await seedReportOnMart();
      await martRepo.softDelete(deleted.dataMart.id);
      await seedIndexRow(live.id);
      await seedIndexRow(deleted.id);

      expect(await visibleIds('proj-1')).toEqual(new Set([live.id]));
    });

    it('drops index rows whose report was hard-deleted', async () => {
      const report = await seedReportOnMart();
      await seedIndexRow(report.id);
      await reportRepo.delete(report.id);

      expect((await visibleIds('proj-1')).size).toBe(0);
    });

    it.each([undefined, { userId: 'admin-1', roles: ['admin'] }])(
      'excludes deleted and cross-project destinations with accessScope %j',
      async accessScope => {
        const mart = await seedMart({ availableForReporting: true });
        const live = await seedReport(mart, await seedDestination());
        const deleted = await seedReport(mart, await seedDestination());
        const crossProject = await seedReport(mart, await seedDestination({}, 'proj-2'));
        await destinationRepo.softDelete(deleted.dataDestination.id);
        for (const report of [live, deleted, crossProject]) await seedIndexRow(report.id);

        expect(await visibleIds('proj-1', accessScope)).toEqual(new Set([live.id]));
      }
    );

    it("viewer sees another owner's report when its data mart and destination are visible", async () => {
      const report = await seedReportOnMart({ availableForReporting: true });
      await dataSource
        .getRepository(ReportOwner)
        .insert({ reportId: report.id, userId: 'other-owner' });
      await seedIndexRow(report.id);

      const visible = await visibleIds('proj-1', { userId: 'viewer-1', roles: ['viewer'] });
      expect(visible).toEqual(new Set([report.id]));
    });

    it('report ownership does not bypass a private data mart', async () => {
      const report = await seedReportOnMart({
        availableForReporting: false,
        availableForMaintenance: false,
      });
      await dataSource
        .getRepository(ReportOwner)
        .insert({ reportId: report.id, userId: 'viewer-1' });
      await seedIndexRow(report.id);

      const visible = await visibleIds('proj-1', { userId: 'viewer-1', roles: ['viewer'] });
      expect(visible.size).toBe(0);
    });

    it.each([false, true])(
      'hides a private destination regardless of report ownership (%s)',
      async isReportOwner => {
        const report = await seedReportOnMart(
          { availableForReporting: true },
          { availableForUse: false, availableForMaintenance: false }
        );
        await dataSource.getRepository(ReportOwner).insert({
          reportId: report.id,
          userId: isReportOwner ? 'viewer-1' : 'other-owner',
        });
        await seedIndexRow(report.id);

        expect(await visibleIds('proj-1', { userId: 'viewer-1', roles: ['viewer'] })).toEqual(
          new Set()
        );
      }
    );

    it('destination owner sees reports of their private destination', async () => {
      const report = await seedReportOnMart(
        { availableForReporting: true },
        { availableForUse: false, availableForMaintenance: false }
      );
      await dataSource.getRepository(DestinationOwner).insert({
        destinationId: report.dataDestination.id,
        userId: 'owner-1',
      });
      await seedIndexRow(report.id);

      expect(await visibleIds('proj-1', { userId: 'owner-1', roles: ['viewer'] })).toEqual(
        new Set([report.id])
      );
    });

    it('viewer sees reports of a destination shared only for maintenance', async () => {
      const report = await seedReportOnMart(
        { availableForReporting: true },
        { availableForUse: false, availableForMaintenance: true }
      );
      await seedIndexRow(report.id);

      expect(await visibleIds('proj-1', { userId: 'viewer-1', roles: ['viewer'] })).toEqual(
        new Set([report.id])
      );
    });

    it("editor can find another owner's report on a data mart shared only for maintenance", async () => {
      const report = await seedReportOnMart({
        availableForReporting: false,
        availableForMaintenance: true,
      });
      await dataSource
        .getRepository(ReportOwner)
        .insert({ reportId: report.id, userId: 'other-owner' });
      await seedIndexRow(report.id);

      expect(await visibleIds('proj-1', { userId: 'editor-1', roles: ['editor'] })).toEqual(
        new Set([report.id])
      );
    });

    it('technical owner sees a report of their private data mart', async () => {
      const report = await seedReportOnMart({
        availableForReporting: false,
        availableForMaintenance: false,
      });
      await dataSource.query(
        'INSERT INTO data_mart_technical_owners (data_mart_id, user_id) VALUES (?, ?)',
        [report.dataMart.id, 'owner-1']
      );
      await seedIndexRow(report.id);

      const visible = await visibleIds('proj-1', { userId: 'owner-1', roles: ['viewer'] });
      expect(visible).toEqual(new Set([report.id]));
    });

    it('admin sees a report with both parents private and bypasses roleScope resolution', async () => {
      const report = await seedReportOnMart(
        { availableForReporting: false, availableForMaintenance: false },
        { availableForUse: false, availableForMaintenance: false }
      );
      await seedIndexRow(report.id);

      const visible = await visibleIds('proj-1', { userId: 'admin-1', roles: ['admin'] });
      expect(visible).toEqual(new Set([report.id]));
      expect(getRoleScope).not.toHaveBeenCalled();
    });

    it('requires a context match for both the data mart and destination', async () => {
      getRoleScope.mockResolvedValue(RoleScope.SELECTED_CONTEXTS);
      const report = await seedReportOnMart({ availableForReporting: true });
      const ctx = contextRepo.create();
      ctx.name = 'Sales';
      ctx.projectId = 'proj-1';
      const savedCtx = await contextRepo.save(ctx);
      await dataSource.query(
        'INSERT INTO data_mart_contexts (data_mart_id, context_id) VALUES (?, ?)',
        [report.dataMart.id, savedCtx.id]
      );
      await seedIndexRow(report.id);

      const hidden = await visibleIds('proj-1', { userId: 'scoped-user', roles: ['viewer'] });
      expect(hidden.size).toBe(0);

      await dataSource.query(
        'INSERT INTO member_role_contexts (user_id, project_id, context_id) VALUES (?, ?, ?)',
        ['scoped-user', 'proj-1', savedCtx.id]
      );
      expect(await visibleIds('proj-1', { userId: 'scoped-user', roles: ['viewer'] })).toEqual(
        new Set()
      );

      await dataSource.getRepository(DestinationContext).insert({
        destinationId: report.dataDestination.id,
        contextId: savedCtx.id,
      });
      const shown = await visibleIds('proj-1', { userId: 'scoped-user', roles: ['viewer'] });
      expect(shown).toEqual(new Set([report.id]));

      await dataSource.getRepository(DataMartContext).delete({ dataMartId: report.dataMart.id });
      expect(await visibleIds('proj-1', { userId: 'scoped-user', roles: ['viewer'] })).toEqual(
        new Set()
      );
    });

    it('filters hidden destinations before candidateLimit and topK', async () => {
      const visible = await seedReportOnMart({ availableForReporting: true });
      const hidden = await seedReportOnMart(
        { availableForReporting: true },
        { availableForUse: false, availableForMaintenance: false }
      );
      const { descriptors } = await source.listSearchablePage('proj-1', null, 100);
      for (const descriptor of descriptors) {
        await seedIndexRow(descriptor.entityId, descriptor.projectId, buildDocument(descriptor));
      }
      await dataSource
        .getRepository(ReportSearchIndex)
        .update({ entityId: hidden.id }, { updatedAt: new Date('2025-01-01T00:00:00.000Z') });
      const search = new InMemoryPaginatedSearch(new IndexableSourceRegistry([source]), indexRepo);

      const results = await search.search(SearchableEntityType.REPORT, 'proj-1', 'revenue', null, {
        candidateLimit: 1,
        topK: 1,
        minRelevance: 0,
        accessScope: { userId: 'viewer-1', roles: ['viewer'] },
      });

      expect(results.map(result => result.entityId)).toEqual([visible.id]);
    });
  });

  it.each([SearchableEntityType.DATA_MART, SearchableEntityType.DATA_DESTINATION] as const)(
    'indexes only the requested %s reports in bounded pages',
    async entityType => {
      const mart = await seedMart();
      const otherMart = await seedMart({ title: 'Other mart' });
      const destination = await seedDestination();
      const otherDestination = await seedDestination({ title: 'Other destination' });
      const one = await seedReport(mart, destination);
      const two = await seedReport(mart, otherDestination);
      const three = await seedReport(otherMart, destination);
      const parent = {
        entityType,
        entityId: entityType === SearchableEntityType.DATA_MART ? mart.id : destination.id,
      };
      const embed = jest.fn(async (texts: string[]) => texts.map(() => new Float32Array([1, 0])));
      const indexer = new SearchIndexerService(
        new IndexableSourceRegistry([source]),
        { modelId: 'test', embed } as unknown as EmbeddingProvider,
        indexRepo,
        { indexBatchSize: 1 } as AdvancedSearchConfig,
        source
      );
      let cursor: PageCursor | null = null;
      let pages = 0;
      do {
        const page = await indexer.reindexReportsPage(parent, 'proj-1', cursor);
        expect(page.errors).toBe(0);
        cursor = page.nextCursor;
        expect(++pages).toBeLessThanOrEqual(3);
      } while (cursor);
      const rows = await dataSource.getRepository(ReportSearchIndex).find();
      expect(rows.map(row => row.entityId).sort()).toEqual(
        [one.id, entityType === SearchableEntityType.DATA_MART ? two.id : three.id].sort()
      );
      expect(embed.mock.calls).toHaveLength(2);
      expect(embed.mock.calls.every(([texts]) => texts.length === 1)).toBe(true);
      expect(await indexer.reindexReportsPage(parent, 'another-project', null)).toEqual({
        nextCursor: null,
        errors: 0,
      });
      expect(embed.mock.calls).toHaveLength(2);
    }
  );

  it('retains successful embeddings in a partially failed report page and reports its failure', async () => {
    const mart = await seedMart();
    const destination = await seedDestination();
    await seedReport(mart, destination);
    await seedReport(mart, destination, { title: 'Second report' });
    const vector = new Float32Array([1, 0]);
    const embed = jest.fn().mockResolvedValueOnce([vector, null]).mockResolvedValue([vector]);
    const indexer = new SearchIndexerService(
      new IndexableSourceRegistry([source]),
      { modelId: 'test', embed } as unknown as EmbeddingProvider,
      indexRepo,
      { indexBatchSize: 50 } as AdvancedSearchConfig,
      source
    );
    const parent = { entityType: SearchableEntityType.DATA_MART as const, entityId: mart.id };
    expect(await indexer.reindexReportsPage(parent, 'proj-1', null)).toEqual({
      nextCursor: null,
      errors: 2,
    });
    expect(await dataSource.getRepository(ReportSearchIndex).count()).toBe(1);
    await indexer.reindexReportsPage(parent, 'proj-1', null);
    expect(await dataSource.getRepository(ReportSearchIndex).count()).toBe(2);
    expect(embed.mock.calls[1][0]).toHaveLength(1);
  });

  describe('concurrent report indexing', () => {
    function deferred<T>() {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>(done => {
        resolve = done;
      });
      return { promise, resolve };
    }

    it('does not leave an intermediate title after a rename back to an already indexed title', async () => {
      const report = await seedReportOnMart();
      const started = deferred<void>();
      const delayed = deferred<(Float32Array | null)[]>();
      const vector = new Float32Array([1, 0]);
      const embed = jest.fn().mockResolvedValue([vector]);
      const indexer = new SearchIndexerService(
        new IndexableSourceRegistry([source]),
        { modelId: 'test', embed } as unknown as EmbeddingProvider,
        indexRepo,
        { indexBatchSize: 50 } as AdvancedSearchConfig,
        source
      );
      await indexer.reindexEntity(SearchableEntityType.REPORT, report.id, 'proj-1');
      await martRepo.update(report.dataMart.id, { title: 'Intermediate title' });
      embed.mockImplementationOnce(() => {
        started.resolve();
        return delayed.promise;
      });
      const older = indexer.syncTypeProject(SearchableEntityType.REPORT, 'proj-1');
      await started.promise;
      await martRepo.update(report.dataMart.id, { title: report.dataMart.title });
      await indexer.reindexReportsPage(
        { entityType: SearchableEntityType.DATA_MART, entityId: report.dataMart.id },
        'proj-1',
        null
      );
      expect(embed).toHaveBeenCalledTimes(2);
      delayed.resolve([vector]);
      expect((await older).errors).toBe(0);
      const row = await dataSource.getRepository(ReportSearchIndex).findOneByOrFail({
        entityId: report.id,
      });
      expect(JSON.parse(row.document!).report.dataMart.title).toBe(report.dataMart.title);
    });

    it('allows simultaneous writers on SQLite without overlapping transactions', async () => {
      const report = await seedReportOnMart();
      const indexer = new SearchIndexerService(
        new IndexableSourceRegistry([source]),
        {
          modelId: 'test',
          embed: jest.fn().mockResolvedValue([new Float32Array([1, 0])]),
        } as unknown as EmbeddingProvider,
        indexRepo,
        { indexBatchSize: 50 } as AdvancedSearchConfig,
        source
      );
      await Promise.all([
        indexer.reindexEntity(SearchableEntityType.REPORT, report.id, 'proj-1'),
        indexer.reindexEntity(SearchableEntityType.REPORT, report.id, 'proj-1'),
      ]);
      expect(await dataSource.getRepository(ReportSearchIndex).count()).toBe(1);
    });

    it('stops after three attempts when the report keeps changing during embedding', async () => {
      const report = await seedReportOnMart();
      const embed = jest.fn(async () => {
        await martRepo.update(report.dataMart.id, { title: `Change ${embed.mock.calls.length}` });
        return [new Float32Array([1, 0])];
      });
      const indexer = new SearchIndexerService(
        new IndexableSourceRegistry([source]),
        { modelId: 'test', embed } as unknown as EmbeddingProvider,
        indexRepo,
        { indexBatchSize: 50 } as AdvancedSearchConfig,
        source
      );
      await expect(
        indexer.reindexEntity(SearchableEntityType.REPORT, report.id, 'proj-1')
      ).rejects.toThrow('changed repeatedly');
      expect(embed).toHaveBeenCalledTimes(3);
    });

    it.each(['old first', 'new first'])(
      'keeps the renamed parent when overlapping project syncs finish %s',
      async order => {
        const report = await seedReportOnMart();
        const oldStarted = deferred<void>();
        const newStarted = deferred<void>();
        const oldEmbedding = deferred<(Float32Array | null)[]>();
        const newEmbedding = deferred<(Float32Array | null)[]>();
        const vector = new Float32Array([1, 0]);
        const embed = jest
          .fn()
          .mockImplementationOnce(() => {
            oldStarted.resolve();
            return oldEmbedding.promise;
          })
          .mockImplementationOnce(() => {
            newStarted.resolve();
            return newEmbedding.promise;
          })
          .mockResolvedValue([vector]);
        const indexer = new SearchIndexerService(
          new IndexableSourceRegistry([source]),
          { modelId: 'test', embed } as unknown as EmbeddingProvider,
          indexRepo,
          { indexBatchSize: 50 } as AdvancedSearchConfig,
          source
        );
        const oldRun = indexer.syncTypeProject(SearchableEntityType.REPORT, 'proj-1');
        await oldStarted.promise;
        await martRepo.update(report.dataMart.id, { title: 'Renamed Orders' });
        const newRun = indexer.syncTypeProject(SearchableEntityType.REPORT, 'proj-1');
        await newStarted.promise;
        if (order === 'old first') {
          oldEmbedding.resolve([vector]);
          await oldRun;
          newEmbedding.resolve([vector]);
        } else {
          newEmbedding.resolve([vector]);
          await newRun;
          oldEmbedding.resolve([vector]);
        }
        const results = await Promise.all([oldRun, newRun]);
        expect(results.every(result => result.errors === 0)).toBe(true);
        const row = await dataSource.getRepository(ReportSearchIndex).findOneByOrFail({
          entityId: report.id,
        });
        expect(JSON.parse(row.document!).report.dataMart.title).toBe('Renamed Orders');
      }
    );
  });
});
