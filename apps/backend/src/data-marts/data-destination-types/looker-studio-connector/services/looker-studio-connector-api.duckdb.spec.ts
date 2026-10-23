jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DataStorageCredentialsResolver } from '../../../data-storage-types/data-storage-credentials-resolver.service';
import { DataMartSchemaFieldStatus } from '../../../data-storage-types/enums/data-mart-schema-field-status.enum';
import { DataStorageType } from '../../../data-storage-types/enums/data-storage-type.enum';
import { DuckDbApiAdapter } from '../../../data-storage-types/duckdb/adapters/duckdb-api.adapter';
import { DuckDbApiAdapterFactory } from '../../../data-storage-types/duckdb/adapters/duckdb-api-adapter.factory';
import { createProductionDuckDbInstance } from '../../../data-storage-types/duckdb/__fixtures__/production-duckdb-instance';
import { DuckdbFieldType } from '../../../data-storage-types/duckdb/enums/duckdb-field-type.enum';
import { DuckDbDataMartSchemaType } from '../../../data-storage-types/duckdb/schemas/duckdb-data-mart-schema.schema';
import { DuckDbClauseRenderer } from '../../../data-storage-types/duckdb/services/duckdb-clause-renderer';
import { DuckDbQueryBuilder } from '../../../data-storage-types/duckdb/services/duckdb-query.builder';
import { DuckDbReportHeadersGenerator } from '../../../data-storage-types/duckdb/services/duckdb-report-headers-generator.service';
import { DuckDbReportReader } from '../../../data-storage-types/duckdb/services/duckdb-report-reader.service';
import { Report } from '../../../entities/report.entity';
import { ReportDataCacheService } from '../../../services/report-data-cache.service';
import { GetDataRequest } from '../schemas/get-data.schema';
import { GetSchemaRequest } from '../schemas/get-schema.schema';
import { LookerStudioAggregationMapperService } from './looker-studio-aggregation-mapper.service';
import { LookerStudioConnectorApiDataService } from './looker-studio-connector-api-data.service';
import { LookerStudioConnectorApiSchemaService } from './looker-studio-connector-api-schema.service';
import { LookerStudioConnectorApiService } from './looker-studio-connector-api.service';
import { LookerStudioTypeMapperService } from './looker-studio-type-mapper.service';

const STORAGE_ID = 'st-looker';
const ROWS = 150;

describe('Looker Studio requests on a DuckDB Data Mart', () => {
  let dir: string;
  let dbPath: string;
  let savedCache: Record<string, unknown> | null;
  let service: LookerStudioConnectorApiService;

  beforeAll(() => {
    for (const level of ['log', 'debug', 'warn', 'error', 'verbose'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
    }
  });

  afterAll(() => jest.restoreAllMocks());

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duck-looker-'));
    dbPath = path.join(dir, `${STORAGE_ID}.duckdb`);
    const instance = await createProductionDuckDbInstance(dbPath);
    const connection = await instance.connect();
    await connection.run(
      `CREATE TABLE main.orders AS SELECT range AS id, 'name_' || range AS name FROM range(1, ${ROWS + 1})`
    );
    connection.closeSync();
    instance.closeSync();

    savedCache = null;
    const cacheRepository = {
      findOne: jest.fn(async () => savedCache),
      save: jest.fn(async (entry: Record<string, unknown>) => {
        savedCache = entry;
      }),
      manager: {
        connection: { options: { type: 'better-sqlite3' } },
        findOne: jest.fn().mockResolvedValue({ id: 'report-1' }),
      },
    };
    const credentialsResolver = {
      resolve: async () => ({ databasePath: dbPath }),
    } as unknown as DataStorageCredentialsResolver;
    const readerResolver = {
      resolve: async () =>
        new DuckDbReportReader(
          new DuckDbApiAdapterFactory(),
          new DuckDbQueryBuilder(new DuckDbClauseRenderer()),
          new DuckDbReportHeadersGenerator(),
          credentialsResolver
        ),
    };
    const blendedReportDataService = {
      resolveBlendingDecision: jest.fn().mockResolvedValue({ needsBlending: false }),
    };
    const cacheService = new ReportDataCacheService(
      cacheRepository as never,
      readerResolver as never,
      blendedReportDataService as never,
      {} as never
    );
    const typeMapper = new LookerStudioTypeMapperService(
      new LookerStudioAggregationMapperService()
    );
    const reportRun = {
      markAsSuccess: jest.fn(),
      markAsUnsuccessful: jest.fn(),
      getReport: () => buildReport(),
      getReportId: () => 'report-1',
      getDataMartRun: () => ({}),
    };

    service = new LookerStudioConnectorApiService(
      {} as never,
      new LookerStudioConnectorApiSchemaService(
        { actualizeSchemaInEntity: jest.fn(), saveActualizedSchema: jest.fn() } as never,
        typeMapper
      ),
      new LookerStudioConnectorApiDataService(typeMapper),
      cacheService,
      { getByIdAndLookerStudioSecret: async () => buildReport() } as never,
      { publishExternal: jest.fn() } as never,
      { create: jest.fn().mockResolvedValue(reportRun), finish: jest.fn() } as never,
      {
        verifyCanPerformOperations: jest.fn(),
        registerLookerReportRunConsumption: jest.fn(),
      } as never,
      blendedReportDataService as never,
      { now: () => new Date().toISOString() } as never,
      { getProjectMemberOrThrow: jest.fn().mockResolvedValue({ role: 'admin' }) } as never
    );
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const connection = {
    connectionConfig: {
      deploymentUrl: 'https://example.com',
      destinationId: 'dest-1',
      destinationSecretKey: 'secret',
    },
  };
  const configParams = { destinationId: 'dest-1', reportId: 'report-1' };

  const getData = (sampleExtraction: boolean) =>
    service.getData({
      ...connection,
      request: {
        configParams,
        scriptParams: { sampleExtraction },
        fields: [{ name: 'id' }, { name: 'name' }],
      },
    } as GetDataRequest);

  const ids = (response: { rows: { values: unknown[] }[] }) => response.rows.map(r => r.values[0]);
  const range = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i);

  async function expectFileReleased(): Promise<void> {
    const writer = new DuckDbApiAdapter(dbPath, 'READ_WRITE', { attempts: 1 });
    try {
      await writer.runStatement('CREATE OR REPLACE VIEW main.probe AS SELECT 1 AS x');
    } finally {
      await writer.close();
    }
  }

  it('returns every row from the first, on a cache miss and on a cache hit', async () => {
    const miss = await getData(false);
    expect(savedCache).not.toBeNull();
    const hit = await getData(false);

    expect(ids(miss)).toEqual(range(1, ROWS));
    expect(ids(hit)).toEqual(range(1, ROWS));
    await expectFileReleased();
  });

  it('releases the file after a 100-row sample, on a cache miss and on a cache hit', async () => {
    expect(ids(await getData(true))).toEqual(range(1, 100));
    await expectFileReleased();

    expect(ids(await getData(true))).toEqual(range(1, 100));
    await expectFileReleased();
  });

  it('releases the file after a schema request', async () => {
    const schema = await service.getSchema({
      ...connection,
      request: { configParams },
    } as GetSchemaRequest);

    expect(schema.schema.map(field => field.name)).toEqual(['id', 'name']);
    await expectFileReleased();
  });
});

function buildReport(): Report {
  return {
    id: 'report-1',
    version: 1,
    createdById: 'user-1',
    destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
    dataMart: {
      id: 'dm-1',
      projectId: 'project-1',
      storage: { id: STORAGE_ID, type: DataStorageType.DUCKDB },
      definition: {
        definitionType: 'CONNECTOR',
        connector: {
          storage: { fullyQualifiedName: 'main.orders' },
          source: { name: 'src', configuration: [{}], node: 'n', fields: ['f'] },
        },
      },
      schema: {
        type: DuckDbDataMartSchemaType,
        fields: [
          { name: 'id', type: DuckdbFieldType.BIGINT, status: DataMartSchemaFieldStatus.CONNECTED },
          {
            name: 'name',
            type: DuckdbFieldType.VARCHAR,
            status: DataMartSchemaFieldStatus.CONNECTED,
          },
        ],
      },
    },
  } as unknown as Report;
}
