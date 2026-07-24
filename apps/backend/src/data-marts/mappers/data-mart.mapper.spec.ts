import { Test, TestingModule } from '@nestjs/testing';
import { DataMartMapper } from './data-mart.mapper';
import { DataStorageMapper } from './data-storage.mapper';
import { ConnectorSecretService } from '../services/connector/connector-secret.service';
import { DataMartRun as DataMartRunEntity } from '../entities/data-mart-run.entity';
import { UserProjectionsListDto } from '../../idp/dto/domain/user-projections-list.dto';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';

describe('DataMartMapper', () => {
  let mapper: DataMartMapper;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataMartMapper,
        {
          provide: DataStorageMapper,
          useValue: {
            toDomainDto: jest.fn().mockReturnValue({}),
          },
        },
        {
          provide: ConnectorSecretService,
          useValue: {},
        },
      ],
    }).compile();

    mapper = module.get<DataMartMapper>(DataMartMapper);
  });

  describe('Data Mart list items', () => {
    it('preserves a persisted null definition type for a draft', () => {
      const definitionState = {
        definitionType: null,
      } satisfies Pick<DataMart, 'definitionType'>;
      const entity = {
        id: 'data-mart-1',
        title: 'New draft',
        status: DataMartStatus.DRAFT,
        storage: {
          type: DataStorageType.GOOGLE_BIGQUERY,
          title: 'Warehouse',
        },
        createdAt: new Date('2026-07-23T12:00:00.000Z'),
        modifiedAt: new Date('2026-07-23T12:00:00.000Z'),
        description: undefined,
        availableForReporting: true,
        availableForMaintenance: false,
        contexts: [],
        ...definitionState,
      } as unknown as DataMart;

      const response = mapper.toListItemResponse(
        mapper.toListItemDto(entity, { triggersCount: 0, reportsCount: 0 })
      );

      expect(response.definitionType).toBeNull();
    });

    it('normalizes a persisted null definition type outside the list contract', () => {
      const definitionState = {
        definitionType: null,
      } satisfies Pick<DataMart, 'definitionType'>;
      const entity = {
        id: 'data-mart-1',
        title: 'New draft',
        status: DataMartStatus.DRAFT,
        storage: {
          type: DataStorageType.GOOGLE_BIGQUERY,
          title: 'Warehouse',
        },
        createdAt: new Date('2026-07-23T12:00:00.000Z'),
        modifiedAt: new Date('2026-07-23T12:00:00.000Z'),
        description: undefined,
        availableForReporting: true,
        availableForMaintenance: false,
        contexts: [],
        ...definitionState,
      } as unknown as DataMart;

      expect(mapper.toDomainDto(entity).definitionType).toBeUndefined();
    });
  });

  describe('toBatchHealthStatusDomainResponse', () => {
    it('should map items and pick the latest report run if there are multiple', () => {
      const requestedIds = ['mart-1'];

      // Create a fake UserProjectionsListDto that doesn't actually need real data for this test
      const userProjections = new UserProjectionsListDto([]);

      const oldReportRun = {
        id: 'report-run-1',
        dataMartId: 'mart-1',
        type: DataMartRunType.EMAIL,
        createdAt: new Date('2026-01-01T10:00:00Z'),
      } as DataMartRunEntity;

      const latestReportRun = {
        id: 'report-run-2',
        dataMartId: 'mart-1',
        type: DataMartRunType.SLACK,
        createdAt: new Date('2026-01-02T10:00:00Z'),
      } as DataMartRunEntity;

      const connectorRun = {
        id: 'connector-run-1',
        dataMartId: 'mart-1',
        type: DataMartRunType.CONNECTOR,
        createdAt: new Date('2026-01-02T12:00:00Z'),
      } as DataMartRunEntity;

      // The array has the latest report run first, which means if no date check existed,
      // the oldReportRun (which is at the end) would overwrite the latestReportRun.
      const latestRuns = [latestReportRun, connectorRun, oldReportRun];

      const result = mapper.toBatchHealthStatusDomainResponse(
        requestedIds,
        latestRuns,
        userProjections
      );

      expect(result.items).toHaveLength(1);

      const mappedItem = result.items[0];
      expect(mappedItem.dataMartId).toBe('mart-1');

      expect(mappedItem.connector).toBeDefined();
      expect(mappedItem.connector?.type).toBe(DataMartRunType.CONNECTOR);
      expect(mappedItem.connector?.id).toBe(connectorRun.id);

      // The report should exactly match the latestReportRun's date,
      // preventing oldReportRun from overwriting it.
      expect(mappedItem.report).toBeDefined();
      expect(mappedItem.report?.createdAt).toEqual(latestReportRun.createdAt);
      expect(mappedItem.report?.type).toEqual(latestReportRun.type);
      expect(mappedItem.report?.id).toEqual(latestReportRun.id);

      expect(mappedItem.insight).toBeNull();
    });
  });

  describe('totals (top-level) + additionalParams masking (via toRunResponse)', () => {
    it('exposes only the httpData subtree for HTTP_DATA runs; totals null when absent', async () => {
      const entity = {
        id: 'run-1',
        status: 'SUCCESS',
        type: DataMartRunType.HTTP_DATA,
        runType: 'manual',
        dataMartId: 'dm-1',
        definitionRun: { kind: 'sql', sql: 'SELECT 1' },
        additionalParams: { httpData: { format: 'ndjson', columns: ['date'] }, internalNote: 'x' },
        createdAt: new Date('2026-05-28T10:00:00Z'),
      } as unknown as DataMartRunEntity;

      const response = await mapper.toRunResponse(mapper.toDataMartRunDto(entity));

      expect(response.additionalParams).toEqual({
        httpData: { format: 'ndjson', columns: ['date'] },
      });
      expect(response.totals).toBeNull();
    });

    it('surfaces HTTP_DATA totals at the TOP LEVEL and strips them from the exposed httpData subtree', async () => {
      const totals = { 'revenue | SUM': 100 };
      const entity = {
        id: 'run-1b',
        status: 'SUCCESS',
        type: DataMartRunType.HTTP_DATA,
        runType: 'manual',
        dataMartId: 'dm-1',
        additionalParams: {
          httpData: { format: 'ndjson', columns: ['date'], totals },
          internalNote: 'x',
        },
        createdAt: new Date('2026-05-28T10:00:00Z'),
      } as unknown as DataMartRunEntity;

      const response = await mapper.toRunResponse(mapper.toDataMartRunDto(entity));

      expect(response.totals).toEqual(totals);
      expect(response.additionalParams).toEqual({
        httpData: { format: 'ndjson', columns: ['date'] },
      });
    });

    it('returns null additionalParams and null totals for non-HTTP_DATA runs without totals', async () => {
      const entity = {
        id: 'run-2',
        status: 'SUCCESS',
        type: DataMartRunType.CONNECTOR,
        runType: 'manual',
        dataMartId: 'dm-1',
        additionalParams: { somethingElse: true },
        createdAt: new Date('2026-05-28T10:00:00Z'),
      } as unknown as DataMartRunEntity;

      const response = await mapper.toRunResponse(mapper.toDataMartRunDto(entity));

      expect(response.additionalParams).toBeNull();
      expect(response.totals).toBeNull();
    });

    it('surfaces report-run totals at the TOP LEVEL (not under additionalParams), masking other internal params', async () => {
      const totals = { 'revenue | SUM': 100, 'quantity | MAX': 6 };
      const entity = {
        id: 'run-3',
        status: 'SUCCESS',
        type: DataMartRunType.GOOGLE_SHEETS_EXPORT,
        runType: 'manual',
        dataMartId: 'dm-1',
        additionalParams: { totals, internalNote: 'secret' },
        createdAt: new Date('2026-05-28T10:00:00Z'),
      } as unknown as DataMartRunEntity;

      const response = await mapper.toRunResponse(mapper.toDataMartRunDto(entity));

      expect(response.totals).toEqual(totals);
      expect(response.additionalParams).toBeNull();
    });

    it('returns null additionalParams and null totals for a report run without totals', async () => {
      const entity = {
        id: 'run-4',
        status: 'SUCCESS',
        type: DataMartRunType.GOOGLE_SHEETS_EXPORT,
        runType: 'manual',
        dataMartId: 'dm-1',
        additionalParams: { internalNote: 'secret' },
        createdAt: new Date('2026-05-28T10:00:00Z'),
      } as unknown as DataMartRunEntity;

      const response = await mapper.toRunResponse(mapper.toDataMartRunDto(entity));

      expect(response.additionalParams).toBeNull();
      expect(response.totals).toBeNull();
    });

    it('surfaces the mcpQuery subtree for MCP_QUERY runs and drops unrelated internal keys', async () => {
      const entity = {
        id: 'run-5',
        status: 'SUCCESS',
        type: DataMartRunType.MCP_QUERY,
        runType: 'manual',
        dataMartId: 'dm-1',
        additionalParams: {
          mcpQuery: {
            columns: ['event_name', 'revenue | SUM'],
            rowCount: 3,
            truncated: false,
            query: { fields: ['event_name', 'revenue'], limit: 100 },
          },
          internalNote: 'x',
        },
        createdAt: new Date('2026-05-28T10:00:00Z'),
      } as unknown as DataMartRunEntity;

      const response = await mapper.toRunResponse(mapper.toDataMartRunDto(entity));

      expect(response.additionalParams).toEqual({
        mcpQuery: {
          columns: ['event_name', 'revenue | SUM'],
          rowCount: 3,
          truncated: false,
          query: { fields: ['event_name', 'revenue'], limit: 100 },
        },
      });
      expect(response.totals).toBeNull();
    });
  });

  describe('toProjectRunsResponse', () => {
    it('preserves an unavailable definition snapshot from a historical run', async () => {
      const entity = {
        id: 'legacy-run-1',
        status: 'FAILED',
        type: DataMartRunType.CONNECTOR,
        runType: 'manual',
        dataMartId: 'dm-legacy',
        definitionRun: null,
        createdAt: new Date('2025-01-01T00:00:00Z'),
      } as unknown as DataMartRunEntity;

      const response = await mapper.toProjectRunsResponse([
        {
          run: mapper.toDataMartRunDto(entity),
          dataMart: { id: 'dm-legacy', title: 'Legacy Data Mart' },
        },
      ]);

      expect(response.runs[0].definitionRun).toBeNull();
    });
  });
});
