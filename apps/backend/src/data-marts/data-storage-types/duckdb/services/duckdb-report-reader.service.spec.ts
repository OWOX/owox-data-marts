import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { DataStorageCredentialsResolver } from '../../data-storage-credentials-resolver.service';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartSchemaFieldStatus } from '../../enums/data-mart-schema-field-status.enum';
import { ReportLikeReadPlan } from '../../../dto/domain/report-like-read-plan';
import { DuckDbApiAdapter } from '../adapters/duckdb-api.adapter';
import { DuckDbApiAdapterFactory } from '../adapters/duckdb-api-adapter.factory';
import { DuckDbClauseRenderer } from './duckdb-clause-renderer';
import { DuckDbQueryBuilder } from './duckdb-query.builder';
import { DuckDbReportHeadersGenerator } from './duckdb-report-headers-generator.service';
import { DuckDbReportReader } from './duckdb-report-reader.service';
import { DuckdbFieldType } from '../enums/duckdb-field-type.enum';
import { DuckDbDataMartSchemaType } from '../schemas/duckdb-data-mart-schema.schema';
import { DuckDbReaderState } from '../interfaces/duckdb-reader-state.interface';
import { createProductionDuckDbInstance } from '../__fixtures__/production-duckdb-instance';

async function seedTable(dbPath: string, ddl: string, insertValuesSql: string): Promise<void> {
  const inst = await createProductionDuckDbInstance(dbPath);
  const conn = await inst.connect();
  await conn.run('CREATE SCHEMA IF NOT EXISTS main');
  await conn.run(ddl);
  await conn.run(insertValuesSql);
  conn.closeSync?.();
  inst.closeSync?.();
}

function buildDefinition(fullyQualifiedName: string): never {
  return {
    definitionType: 'CONNECTOR',
    connector: {
      storage: { fullyQualifiedName },
      source: { name: 'src', configuration: [{}], node: 'n', fields: ['f'] },
    },
  } as never;
}

function buildReport(
  storageId: string,
  fullyQualifiedName: string,
  fields: { name: string; type: DuckdbFieldType }[]
): ReportLikeReadPlan {
  return {
    dataMart: {
      storage: { id: storageId, type: DataStorageType.DUCKDB },
      definition: buildDefinition(fullyQualifiedName),
      schema: {
        type: DuckDbDataMartSchemaType,
        fields: fields.map(f => ({
          name: f.name,
          type: f.type,
          status: DataMartSchemaFieldStatus.CONNECTED,
        })),
      },
    },
  } as unknown as ReportLikeReadPlan;
}

describe('DuckDbReportReader', () => {
  let dir: string;
  let credentialsResolver: DataStorageCredentialsResolver;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duck-reader-'));
    credentialsResolver = {
      resolve: async ({ id }: { id: string }) => ({ databasePath: path.join(dir, `${id}.duckdb`) }),
    } as unknown as DataStorageCredentialsResolver;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function buildReader(): DuckDbReportReader {
    return new DuckDbReportReader(
      new DuckDbApiAdapterFactory(),
      new DuckDbQueryBuilder(new DuckDbClauseRenderer()),
      new DuckDbReportHeadersGenerator(),
      credentialsResolver
    );
  }

  describe('streaming cursor across batches', () => {
    const storageId = 'st-reader-1';
    const fields = [
      { name: 'id', type: DuckdbFieldType.BIGINT },
      { name: 'name', type: DuckdbFieldType.VARCHAR },
      { name: 'created_at', type: DuckdbFieldType.DATE },
    ];

    beforeEach(async () => {
      const dbPath = path.join(dir, `${storageId}.duckdb`);
      await seedTable(
        dbPath,
        'CREATE TABLE main."orders"(id BIGINT, name VARCHAR, created_at DATE)',
        `INSERT INTO main."orders" VALUES
           (1, 'alpha', DATE '2024-01-01'),
           (2, 'beta', DATE '2024-01-02'),
           (3, 'gamma', DATE '2024-01-03')`
      );
    });

    it(
      'batch 1 returns a page with a continuation token, batch 2 continues with no ' +
        'overlap/gap and a null final token, and a bigint + a date are serialized; ' +
        'finalize closes the stream and the adapter',
      async () => {
        const reader = buildReader();
        const factorySpy = jest.spyOn(DuckDbApiAdapterFactory.prototype, 'createForDatabasePath');

        const description = await reader.prepareReportData(
          buildReport(storageId, 'main.orders', fields)
        );
        expect(description.dataHeaders.map(h => h.name)).toEqual(['id', 'name', 'created_at']);

        const adapter = factorySpy.mock.results[0].value as DuckDbApiAdapter;
        const streamQuerySpy = jest.spyOn(adapter, 'streamQuery');
        const adapterCloseSpy = jest.spyOn(adapter, 'close');

        // Batch 1: first page, small maxDataRows to force a leftover buffer.
        const batch1 = await reader.readReportDataBatch(undefined, 2);
        expect(batch1.dataRows).toHaveLength(2);
        expect(batch1.nextDataBatchId).not.toBeNull();

        // bigint id -> JS number.
        expect(batch1.dataRows[0][0]).toBe(1);
        expect(typeof batch1.dataRows[0][0]).toBe('number');
        expect(batch1.dataRows[1][0]).toBe(2);
        // DuckDBDateValue -> its own toString() text.
        expect(batch1.dataRows[0][2]).toBe('2024-01-01');

        const streamInstance = await streamQuerySpy.mock.results[0].value;
        const streamCloseSpy = jest.spyOn(streamInstance, 'close');

        // Batch 2: continues where batch 1 stopped (row 3 only) -- no overlap, no gap.
        const batch2 = await reader.readReportDataBatch(batch1.nextDataBatchId ?? undefined, 2);
        expect(batch2.dataRows).toHaveLength(1);
        expect(batch2.dataRows[0][0]).toBe(3);
        expect(batch2.nextDataBatchId).toBeNull();
        expect(adapterCloseSpy).not.toHaveBeenCalled();

        await reader.finalize();
        expect(streamCloseSpy).toHaveBeenCalledTimes(1);
        expect(adapterCloseSpy).toHaveBeenCalledTimes(1);
      }
    );

    it('reads from the first row again when no batch id is given, as after the cache probe', async () => {
      const reader = buildReader();
      await reader.prepareReportData(buildReport(storageId, 'main.orders', fields));

      const probe = await reader.readReportDataBatch(undefined, 1);
      const all = await reader.readReportDataBatch(undefined, 10);
      const afterEnd = await reader.readReportDataBatch(undefined, 10);
      await reader.finalize();

      expect(probe.dataRows.map(row => row[0])).toEqual([1]);
      expect(all.dataRows.map(row => row[0])).toEqual([1, 2, 3]);
      expect(all.nextDataBatchId).toBeNull();
      expect(afterEnd.dataRows.map(row => row[0])).toEqual([1, 2, 3]);
    });

    it('releases the file on finalize', async () => {
      const reader = buildReader();
      await reader.prepareReportData(buildReport(storageId, 'main.orders', fields));
      await reader.readReportDataBatch(undefined, 1);

      await reader.finalize();

      const writer = new DuckDbApiAdapter(path.join(dir, `${storageId}.duckdb`), 'READ_WRITE', {
        attempts: 1,
      });
      try {
        await writer.runStatement('CREATE VIEW main.v AS SELECT 1 AS x');
      } finally {
        await writer.close();
      }
    });

    it('finalize is idempotent: a second call does not double-close the stream', async () => {
      const reader = buildReader();
      const factorySpy = jest.spyOn(DuckDbApiAdapterFactory.prototype, 'createForDatabasePath');

      await reader.prepareReportData(buildReport(storageId, 'main.orders', fields));

      const adapter = factorySpy.mock.results[0].value as DuckDbApiAdapter;
      const streamQuerySpy = jest.spyOn(adapter, 'streamQuery');

      await reader.readReportDataBatch(undefined, 2);

      const streamInstance = await streamQuerySpy.mock.results[0].value;
      const streamCloseSpy = jest.spyOn(streamInstance, 'close');

      await reader.finalize();
      await expect(reader.finalize()).resolves.toBeUndefined();

      expect(streamCloseSpy).toHaveBeenCalledTimes(1);
    });

    it('closes the adapter even when closing the stream fails', async () => {
      const reader = buildReader();
      const factorySpy = jest.spyOn(DuckDbApiAdapterFactory.prototype, 'createForDatabasePath');
      await reader.prepareReportData(buildReport(storageId, 'main.orders', fields));
      const adapter = factorySpy.mock.results[0].value as DuckDbApiAdapter;
      const streamQuerySpy = jest.spyOn(adapter, 'streamQuery');
      const adapterCloseSpy = jest.spyOn(adapter, 'close');
      await reader.readReportDataBatch(undefined, 1);
      const stream = await streamQuerySpy.mock.results[0].value;
      jest.spyOn(stream, 'close').mockRejectedValueOnce(new Error('drain failed'));

      await expect(reader.finalize()).rejects.toThrow('drain failed');
      expect(adapterCloseSpy).toHaveBeenCalledTimes(1);
    });

    it('getState/initFromState: a reader restored from the cache reads from the first row', async () => {
      const reportPlan = buildReport(storageId, 'main.orders', fields);

      const reader1 = buildReader();
      await reader1.prepareReportData(reportPlan);
      await reader1.readReportDataBatch(undefined, 1);
      const state = reader1.getState() as DuckDbReaderState;
      expect(state).toEqual({ type: DataStorageType.DUCKDB, sql: expect.any(String) });
      await reader1.finalize();

      // ReportDataCacheService.restoreReaderFromCache always calls prepareReportData
      // before initFromState -- mirror that sequencing on a brand-new instance.
      const reader2 = buildReader();
      const description = await reader2.prepareReportData(reportPlan);
      await reader2.initFromState(state, description.dataHeaders);

      const batch = await reader2.readReportDataBatch(undefined, 10);
      expect(batch.dataRows.map(row => row[0])).toEqual([1, 2, 3]);
      expect(batch.nextDataBatchId).toBeNull();

      await reader2.finalize();
    });

    it('getState returns null before prepareReportData has run', () => {
      const reader = buildReader();
      expect(reader.getState()).toBeNull();
    });
  });

  describe('query limits', () => {
    const storageId = 'st-reader-limits';
    // Cannot finish in test time on any host: only an interrupt ends it.
    const longQuery = 'SELECT sum(a.range * b.range) AS n FROM range(1000000) a, range(1000000) b';
    const report = () =>
      buildReport(storageId, 'main.t', [{ name: 'n', type: DuckdbFieldType.BIGINT }]);

    it('honors the query timeout', async () => {
      const reader = buildReader();
      expect(reader.honorsQueryTimeout).toBe(true);
      await reader.prepareReportData(report(), { sqlOverride: longQuery, queryTimeoutMs: 200 });
      try {
        await expect(reader.readReportDataBatch(undefined, 10)).rejects.toThrow(/interrupt/i);
      } finally {
        await reader.finalize();
      }
    }, 20000);

    it('stops the query when its signal aborts', async () => {
      const controller = new AbortController();
      const reader = buildReader();
      await reader.prepareReportData(report(), {
        sqlOverride: longQuery,
        signal: controller.signal,
      });
      setTimeout(() => controller.abort(), 200);
      try {
        await expect(reader.readReportDataBatch(undefined, 10)).rejects.toThrow(/interrupt/i);
      } finally {
        await reader.finalize();
      }
    }, 20000);
  });

  describe('serializeValue edge cases via a real query', () => {
    it('serializes a bigint outside Number.isSafeInteger as a string, not a lossy number', async () => {
      const storageId = 'st-reader-bigint';
      const dbPath = path.join(dir, `${storageId}.duckdb`);
      const bigId = '9223372036854775000';
      await seedTable(
        dbPath,
        'CREATE TABLE main."big_orders"(id BIGINT, name VARCHAR)',
        `INSERT INTO main."big_orders" VALUES (${bigId}, 'solo'), (1, 'small')`
      );

      const reader = buildReader();
      await reader.prepareReportData(
        buildReport(storageId, 'main.big_orders', [
          { name: 'id', type: DuckdbFieldType.BIGINT },
          { name: 'name', type: DuckdbFieldType.VARCHAR },
        ])
      );

      const batch = await reader.readReportDataBatch(undefined, 10);
      expect(batch.dataRows).toHaveLength(2);
      const byName = Object.fromEntries(batch.dataRows.map(row => [row[1], row[0]]));
      expect(byName.solo).toBe(bigId);
      expect(typeof byName.solo).toBe('string');
      // A small bigint still serializes to a plain JS number.
      expect(byName.small).toBe(1);
      expect(typeof byName.small).toBe('number');

      await reader.finalize();
    });
  });
});
