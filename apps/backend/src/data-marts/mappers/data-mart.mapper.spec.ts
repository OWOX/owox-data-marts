import { Test, TestingModule } from '@nestjs/testing';
import { DataMartMapper } from './data-mart.mapper';
import { DataStorageMapper } from './data-storage.mapper';
import { ConnectorSecretService } from '../services/connector/connector-secret.service';
import { DataMartRun as DataMartRunEntity } from '../entities/data-mart-run.entity';
import { UserProjectionsListDto } from '../../idp/dto/domain/user-projections-list.dto';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { DataQualitySummaryState } from '../enums/data-quality-summary-state.enum';

describe('DataMartMapper', () => {
  let mapper: DataMartMapper;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataMartMapper,
        {
          provide: DataStorageMapper,
          useValue: {},
        },
        {
          provide: ConnectorSecretService,
          useValue: {},
        },
      ],
    }).compile();

    mapper = module.get<DataMartMapper>(DataMartMapper);
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

    it('does not classify DATA_QUALITY or another non-report run as report health', () => {
      const userProjections = new UserProjectionsListDto([]);
      const latestRuns = [
        {
          id: 'dq-run',
          dataMartId: 'mart-1',
          type: DataMartRunType.DATA_QUALITY,
          createdAt: new Date(),
        },
        {
          id: 'mcp-run',
          dataMartId: 'mart-1',
          type: DataMartRunType.MCP_QUERY,
          createdAt: new Date(),
        },
      ] as DataMartRunEntity[];

      const [item] = mapper.toBatchHealthStatusDomainResponse(
        ['mart-1'],
        latestRuns,
        userProjections
      ).items;

      expect(item.report).toBeNull();
    });
  });

  describe('Data Quality run history summary', () => {
    it('maps the compact summary from the DataMartRun row', () => {
      const entity = {
        id: 'run-dq',
        status: 'SUCCESS',
        type: DataMartRunType.DATA_QUALITY,
        runType: 'manual',
        dataMartId: 'dm-1',
        createdAt: new Date('2026-05-28T10:00:00Z'),
        finishedAt: new Date('2026-05-28T10:01:00Z'),
        dataQualitySummary: {
          state: DataQualitySummaryState.ISSUES,
          enabledChecks: 2,
          totalChecks: 2,
          passedChecks: 1,
          failedChecks: 1,
          notApplicableChecks: 0,
          errorChecks: 0,
          noticeFindings: 0,
          warningFindings: 1,
          errorFindings: 0,
          violationCount: 4,
          highestSeverity: 'warning',
        },
      } as unknown as DataMartRunEntity;

      expect(mapper.toDataMartRunDto(entity).qualitySummary).toMatchObject({
        dataMartRunId: 'run-dq',
        lastRunAt: new Date('2026-05-28T10:01:00Z'),
        state: DataQualitySummaryState.ISSUES,
      });
    });

    it('keeps the summary null for non-DQ history rows', () => {
      const entity = {
        id: 'run-report',
        status: 'SUCCESS',
        type: DataMartRunType.EMAIL,
        runType: 'manual',
        dataMartId: 'dm-1',
        createdAt: new Date(),
      } as unknown as DataMartRunEntity;
      expect(mapper.toDataMartRunDto(entity).qualitySummary).toBeNull();
    });

    it('keeps heavy DQ detail out of Data Mart and project list rows', async () => {
      const dataQuality = {
        snapshot: { config: { timezone: 'UTC', rules: [] }, relationships: [] },
        summary: { state: DataQualitySummaryState.PASSED },
        results: [{ ruleKey: 'empty_table:data_mart', executedSql: ['SELECT secret'] }],
      };
      const run = {
        id: 'run-dq',
        status: 'SUCCESS',
        type: DataMartRunType.DATA_QUALITY,
        runType: 'manual',
        dataMartId: 'dm-1',
        definitionRun: { type: 'table' },
        reportId: null,
        reportDefinition: null,
        insightId: null,
        insightDefinition: null,
        insightTemplateId: null,
        insightTemplateDefinition: null,
        aiSourceDefinition: null,
        logs: [],
        errors: [],
        createdAt: new Date('2026-05-28T10:00:00Z'),
        startedAt: null,
        finishedAt: null,
        createdByUser: null,
        additionalParams: null,
        qualitySummary: { state: DataQualitySummaryState.PASSED },
        dataQuality,
      } as never;

      const [dataMartList, projectList] = await Promise.all([
        mapper.toRunsResponse([run]),
        mapper.toProjectRunsResponse([
          { run, dataMart: { id: 'dm-1', title: 'Data Mart' } } as never,
        ]),
      ]);

      expect(dataMartList.runs[0]).toMatchObject({
        type: DataMartRunType.DATA_QUALITY,
        qualitySummary: { state: DataQualitySummaryState.PASSED },
      });
      expect(dataMartList.runs[0]).not.toHaveProperty('dataQuality');
      expect(dataMartList.runs[0]).not.toHaveProperty('snapshot');
      expect(dataMartList.runs[0]).not.toHaveProperty('results');
      expect(projectList.runs[0]).toMatchObject({
        type: DataMartRunType.DATA_QUALITY,
        qualitySummary: { state: DataQualitySummaryState.PASSED },
      });
      expect(projectList.runs[0]).not.toHaveProperty('dataQuality');
      expect(projectList.runs[0]).not.toHaveProperty('snapshot');
      expect(projectList.runs[0]).not.toHaveProperty('results');
    });

    it('includes full DQ data only in a generic run detail response', async () => {
      const dataQuality = {
        snapshot: { config: { timezone: 'UTC', rules: [] }, relationships: [] },
        summary: { state: DataQualitySummaryState.PASSED },
        results: [],
      };
      const run = {
        id: 'run-dq',
        status: 'SUCCESS',
        type: DataMartRunType.DATA_QUALITY,
        runType: 'manual',
        dataMartId: 'dm-1',
        definitionRun: { type: 'table' },
        reportId: null,
        reportDefinition: null,
        insightId: null,
        insightDefinition: null,
        insightTemplateId: null,
        insightTemplateDefinition: null,
        aiSourceDefinition: null,
        logs: [],
        errors: [],
        createdAt: new Date('2026-05-28T10:00:00Z'),
        startedAt: null,
        finishedAt: null,
        createdByUser: null,
        additionalParams: null,
        qualitySummary: { state: DataQualitySummaryState.PASSED },
        dataQuality,
      } as never;

      await expect(mapper.toRunResponse(run)).resolves.toMatchObject({ dataQuality });
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
});
