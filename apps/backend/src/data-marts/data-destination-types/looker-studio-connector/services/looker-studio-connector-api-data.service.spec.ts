import { Response } from 'express';
import { PassThrough, Writable } from 'stream';
import * as zlib from 'zlib';
import { Test } from '@nestjs/testing';
import { BigQueryFieldType } from '../../../data-storage-types/bigquery/enums/bigquery-field-type.enum';
import { DataStorageType } from '../../../data-storage-types/enums/data-storage-type.enum';
import { ReportDataHeader } from '../../../dto/domain/report-data-header.dto';
import { CachedReaderData } from '../../../dto/domain/cached-reader-data.dto';
import { Report } from '../../../entities/report.entity';
import { FieldConceptType } from '../enums/field-concept-type.enum';
import { FieldDataType } from '../enums/field-data-type.enum';
import { AggregationType } from '../enums/aggregation-type.enum';
import { GetDataRequest } from '../schemas/get-data.schema';
import { LookerStudioConnectorApiDataService } from './looker-studio-connector-api-data.service';
import { LookerStudioTypeMapperService } from './looker-studio-type-mapper.service';
import { LookerStudioAggregationMapperService } from './looker-studio-aggregation-mapper.service';

describe('LookerStudioConnectorApiDataService', () => {
  let service: LookerStudioConnectorApiDataService;
  let typeMapperService: jest.Mocked<LookerStudioTypeMapperService>;

  beforeEach(() => {
    typeMapperService = {
      mapToLookerStudioDataType: jest.fn().mockReturnValue(FieldDataType.STRING),
      buildSchemaField: jest.fn().mockImplementation((header: ReportDataHeader) => ({
        name: header.name,
        label: header.alias || header.name,
        dataType: FieldDataType.STRING,
        semantics: { conceptType: FieldConceptType.DIMENSION },
      })),
    } as unknown as jest.Mocked<LookerStudioTypeMapperService>;

    service = new LookerStudioConnectorApiDataService(typeMapperService);

    (service as any).logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
  });

  const createMockReport = (): Report =>
    ({
      id: 'report-1',
      dataMart: {
        id: 'datamart-1',
        storage: { type: DataStorageType.GOOGLE_BIGQUERY },
      },
    }) as unknown as Report;

  const createMockRequest = (fields: string[]): GetDataRequest =>
    ({
      connectionConfig: { destinationSecretKey: 'secret' },
      request: {
        configParams: { reportId: 'report-1' },
        fields: fields.map(name => ({ name })),
      },
    }) as GetDataRequest;

  const createMockCachedReader = (
    headers: Array<{ name: string; storageFieldType: string; aggregateFunction?: string }>,
    batches: Array<{ rows: unknown[][]; nextBatchId?: string }>
  ): CachedReaderData => {
    let batchIndex = 0;

    return {
      fromCache: true,
      dataDescription: {
        dataHeaders: headers.map(h => ({
          name: h.name,
          storageFieldType: h.storageFieldType,
          aggregateFunction: h.aggregateFunction,
        })),
      },
      reader: {
        readReportDataBatch: jest.fn().mockImplementation(() => {
          const batch = batches[batchIndex];
          batchIndex++;
          return Promise.resolve({
            dataRows: batch.rows,
            nextDataBatchId: batch.nextBatchId,
          });
        }),
      },
    } as unknown as CachedReaderData;
  };

  const createMockResponse = (): {
    res: Partial<Response>;
    chunks: Buffer[];
    headers: Record<string, string>;
  } => {
    const chunks: Buffer[] = [];
    const headers: Record<string, string> = {};

    const res = new PassThrough() as any;
    res.setHeader = jest.fn((key: string, value: string) => {
      headers[key] = value;
      return res;
    });

    let isClosed = false;
    Object.defineProperty(res, 'closed', {
      get: () => isClosed,
      set: val => {
        isClosed = val;
      },
      configurable: true,
    });

    const originalEnd = res.end.bind(res);
    res.end = jest.fn().mockImplementation((...args) => {
      res.closed = true;
      return originalEnd(...args);
    });

    res.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    res.waitForFinish = () => new Promise(resolve => res.on('finish', resolve));

    return { res, chunks, headers };
  };

  const parseResponse = (chunks: Buffer[]): any => {
    const buffer = Buffer.concat(chunks);
    const decompressed = zlib.gunzipSync(buffer).toString();
    return JSON.parse(decompressed);
  };

  describe('prepareStreamingContext', () => {
    it('should prepare streaming context with schema and field mapping', async () => {
      const report = createMockReport();
      const request = createMockRequest(['field1', 'field2']);
      const cachedReader = createMockCachedReader(
        [
          { name: 'field1', storageFieldType: 'STRING' },
          { name: 'field2', storageFieldType: 'INTEGER' },
          { name: 'field3', storageFieldType: 'STRING' },
        ],
        []
      );

      const context = await service.prepareStreamingContext(request, report, cachedReader, false);

      expect(context.schema).toHaveLength(2);
      expect(context.schema[0].name).toBe('field1');
      expect(context.schema[1].name).toBe('field2');
      expect(context.fieldIndexMap).toEqual([0, 1]);
      expect(context.rowLimit).toBe(1_000_000);
    });

    it('should use 100 row limit for sample extraction', async () => {
      const report = createMockReport();
      const request = createMockRequest(['field1']);
      const cachedReader = createMockCachedReader(
        [{ name: 'field1', storageFieldType: 'STRING' }],
        []
      );

      const context = await service.prepareStreamingContext(request, report, cachedReader, true);

      expect(context.rowLimit).toBe(100);
    });

    it('names the unresolvable fields when none of the requested fields exist anymore', async () => {
      // Looker Studio persists the data-source schema and keeps requesting fields by their old
      // names, so a chart bound to a column the report no longer produces must get an error
      // that says WHICH names failed — not a generic "no valid fields".
      const report = createMockReport();
      const request = createMockRequest(['Row Count']);
      const cachedReader = createMockCachedReader(
        [{ name: 'field1', storageFieldType: 'STRING' }],
        []
      );

      await expect(
        service.prepareStreamingContext(request, report, cachedReader, false)
      ).rejects.toThrow(
        /None of the requested fields exist.*\[Row Count\].*refresh the data source/
      );
    });
  });

  describe('streamData', () => {
    it('reports the exact UTF-8 byte size of the JSON body', async () => {
      const { res, chunks } = createMockResponse();

      const context = {
        schema: [{ name: 'emoji 🚀', dataType: FieldDataType.STRING }],
        reader: {
          readReportDataBatch: jest.fn().mockResolvedValue({
            dataRows: [['Hello 😀']],
            nextDataBatchId: null,
          }),
        },
        fieldIndexMap: [0],
        rowLimit: 1_000_000,
      };

      const streamResultPromise = service.streamData(res as Response, context as any);
      await (res as any).waitForFinish();
      const result = await streamResultPromise;
      const body = zlib.gunzipSync(Buffer.concat(chunks));

      expect(result.bytesWritten).toBe(body.byteLength);
    });

    it('does not write a UTF-8 row that would exceed the Apps Script response limit', async () => {
      const { res, chunks } = createMockResponse();

      const context = {
        schema: [{ name: 'field1', dataType: FieldDataType.STRING }],
        reader: {
          readReportDataBatch: jest.fn().mockResolvedValue({
            dataRows: [['kept'], ['🚀'.repeat(13_000_000)]],
            nextDataBatchId: null,
          }),
        },
        fieldIndexMap: [0],
        rowLimit: 2,
      };

      const streamResultPromise = service.streamData(res as Response, context as any);
      await (res as any).waitForFinish();
      const result = await streamResultPromise;
      const body = zlib.gunzipSync(Buffer.concat(chunks));

      expect(result.limitExceeded).toBe(true);
      expect(result.rowCount).toBe(1);
      expect(body.byteLength).toBeLessThanOrEqual(49 * 1024 * 1024);
      expect(JSON.parse(body.toString()).rows).toEqual([{ values: ['kept'] }]);
    });

    it('does not resolve before the compressed response finishes', async () => {
      let releaseFirstWrite!: () => void;
      let markFirstWriteStarted!: () => void;
      const firstWriteStarted = new Promise<void>(resolve => {
        markFirstWriteStarted = resolve;
      });
      let shouldBlockWrite = true;
      const res = new Writable({
        write(_chunk, _encoding, callback) {
          if (shouldBlockWrite) {
            shouldBlockWrite = false;
            releaseFirstWrite = callback;
            markFirstWriteStarted();
            return;
          }
          callback();
        },
      }) as Writable & Partial<Response>;
      res.setHeader = jest.fn().mockReturnThis();

      const context = {
        schema: [{ name: 'field1', dataType: FieldDataType.STRING }],
        reader: {
          readReportDataBatch: jest.fn().mockResolvedValue({
            dataRows: [['value1']],
            nextDataBatchId: null,
          }),
        },
        fieldIndexMap: [0],
        rowLimit: 1_000_000,
      };

      let resolved = false;
      const resultPromise = service.streamData(res as Response, context as any).then(result => {
        resolved = true;
        return result;
      });

      await firstWriteStarted;
      await Promise.resolve();

      expect(resolved).toBe(false);
      releaseFirstWrite();
      await resultPromise;
      expect(res.writableFinished).toBe(true);
    });

    it('rejects when the response closes during a backpressured gzip write', async () => {
      let destinationWrites = 0;
      let markBackpressured!: () => void;
      const backpressured = new Promise<void>(resolve => {
        markBackpressured = resolve;
      });
      let gzip!: zlib.Gzip;
      const res = new Writable({
        highWaterMark: 1,
        write(_chunk, _encoding, callback) {
          destinationWrites += 1;
          if (destinationWrites === 1) {
            callback();
            return;
          }
          markBackpressured();
        },
      }) as Writable & Partial<Response>;
      res.setHeader = jest.fn().mockReturnThis();
      res.once('pipe', source => {
        gzip = source as zlib.Gzip;
      });

      const context = {
        schema: [{ name: 'field1', dataType: FieldDataType.STRING }],
        reader: {
          readReportDataBatch: jest.fn().mockResolvedValue({
            dataRows: [[Array.from({ length: 100_000 }, (_, i) => i.toString(36)).join(',')]],
            nextDataBatchId: null,
          }),
        },
        fieldIndexMap: [0],
        rowLimit: 1_000_000,
      };

      const resultPromise = service.streamData(res as Response, context as any);
      await backpressured;
      for (
        let attempt = 0;
        attempt < 100 && gzip.readableLength < gzip.readableHighWaterMark;
        attempt += 1
      ) {
        await new Promise(resolve => setImmediate(resolve));
      }
      expect(gzip.readableLength).toBeGreaterThanOrEqual(gzip.readableHighWaterMark);

      let timeout: NodeJS.Timeout | undefined;
      const completion = Promise.race([
        resultPromise,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('streamData remained pending')), 1_000);
        }),
      ]);

      res.destroy(new Error('client disconnected'));

      try {
        await expect(completion).rejects.toThrow('client disconnected');
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    });

    it('rejects when the response closes while a batch is loading', async () => {
      const res = new PassThrough() as PassThrough & Partial<Response>;
      res.setHeader = jest.fn().mockReturnThis();
      res.resume();

      const context = {
        schema: [{ name: 'field1', dataType: FieldDataType.STRING }],
        reader: {
          readReportDataBatch: jest.fn().mockImplementation(async () => {
            res.destroy();
            await new Promise(resolve => setImmediate(resolve));
            return { dataRows: [], nextDataBatchId: null };
          }),
        },
        fieldIndexMap: [0],
        rowLimit: 1_000_000,
      };

      await expect(service.streamData(res as Response, context as any)).rejects.toThrow();
    });

    it('should stream JSON response with correct structure', async () => {
      const { res, chunks, headers } = createMockResponse();

      const context = {
        schema: [{ name: 'field1', dataType: FieldDataType.STRING }],
        reader: {
          readReportDataBatch: jest.fn().mockResolvedValue({
            dataRows: [['value1'], ['value2']],
            nextDataBatchId: null,
          }),
        },
        fieldIndexMap: [0],
        rowLimit: 1_000_000,
      };

      const streamResultPromise = service.streamData(res as Response, context as any);
      await (res as any).waitForFinish();
      const result = await streamResultPromise;

      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Content-Encoding']).toBe('gzip');
      expect(headers['Transfer-Encoding']).toBe('chunked');
      expect(headers['X-Accel-Buffering']).toBe('no');
      expect(result.rowCount).toBe(2);
      expect(result.limitExceeded).toBe(false);
      expect(result.limitReason).toBeUndefined();
      expect(res.end).toHaveBeenCalled();

      // Verify JSON structure
      const parsed = parseResponse(chunks);
      expect(parsed.schema).toEqual([{ name: 'field1', dataType: FieldDataType.STRING }]);
      expect(parsed.rows).toHaveLength(2);
      expect(parsed.rows[0].values).toEqual(['value1']);
      expect(parsed.rows[1].values).toEqual(['value2']);
      expect(parsed.filtersApplied).toEqual([]);
    });

    it('should handle multiple batches', async () => {
      const { res, chunks } = createMockResponse();

      let batchCall = 0;
      const context = {
        schema: [{ name: 'field1', dataType: FieldDataType.STRING }],
        reader: {
          readReportDataBatch: jest.fn().mockImplementation(() => {
            batchCall++;
            if (batchCall === 1) {
              return Promise.resolve({
                dataRows: [['batch1-row1'], ['batch1-row2']],
                nextDataBatchId: 'batch2',
              });
            }
            return Promise.resolve({
              dataRows: [['batch2-row1']],
              nextDataBatchId: null,
            });
          }),
        },
        fieldIndexMap: [0],
        rowLimit: 1_000_000,
      };

      const streamResultPromise = service.streamData(res as Response, context as any);
      await (res as any).waitForFinish();
      const result = await streamResultPromise;

      expect(result.rowCount).toBe(3);
      expect(result.limitExceeded).toBe(false);
      expect(result.limitReason).toBeUndefined();

      const parsed = parseResponse(chunks);
      expect(parsed.rows).toHaveLength(3);
    });

    it('should respect row limit and stop streaming', async () => {
      const { res, chunks } = createMockResponse();

      const context = {
        schema: [{ name: 'field1', dataType: FieldDataType.STRING }],
        reader: {
          readReportDataBatch: jest.fn().mockResolvedValue({
            dataRows: [['row1'], ['row2'], ['row3'], ['row4'], ['row5']],
            nextDataBatchId: 'more-data',
          }),
        },
        fieldIndexMap: [0],
        rowLimit: 3,
      };

      const streamResultPromise = service.streamData(res as Response, context as any);
      await (res as any).waitForFinish();
      const result = await streamResultPromise;

      expect(result.rowCount).toBe(3);
      expect(result.limitExceeded).toBe(true);
      expect(result.limitReason).toBe('Row limit reached (3 rows)');

      const parsed = parseResponse(chunks);
      expect(parsed.rows).toHaveLength(3);
    });

    it('should handle null and various value types', async () => {
      const { res, chunks } = createMockResponse();

      const context = {
        schema: [
          { name: 'stringField', dataType: FieldDataType.STRING },
          { name: 'numberField', dataType: FieldDataType.NUMBER },
          { name: 'boolField', dataType: FieldDataType.BOOLEAN },
          { name: 'nullField', dataType: FieldDataType.STRING },
        ],
        reader: {
          readReportDataBatch: jest.fn().mockResolvedValue({
            dataRows: [['hello', 42, true, null]],
            nextDataBatchId: null,
          }),
        },
        fieldIndexMap: [0, 1, 2, 3],
        rowLimit: 1_000_000,
      };

      const streamResultPromise = service.streamData(res as Response, context as any);
      await (res as any).waitForFinish();
      await streamResultPromise;

      const parsed = parseResponse(chunks);
      expect(parsed.rows[0].values).toEqual(['hello', 42, true, null]);
    });

    it('should handle empty result set', async () => {
      const { res, chunks } = createMockResponse();

      const context = {
        schema: [{ name: 'field1', dataType: FieldDataType.STRING }],
        reader: {
          readReportDataBatch: jest.fn().mockResolvedValue({
            dataRows: [],
            nextDataBatchId: null,
          }),
        },
        fieldIndexMap: [0],
        rowLimit: 1_000_000,
      };

      const streamResultPromise = service.streamData(res as Response, context as any);
      await (res as any).waitForFinish();
      const result = await streamResultPromise;

      expect(result.rowCount).toBe(0);
      expect(result.limitExceeded).toBe(false);
      expect(result.limitReason).toBeUndefined();

      const parsed = parseResponse(chunks);
      expect(parsed.rows).toEqual([]);
    });
  });

  describe('getData (non-streaming)', () => {
    it('should return complete response for sample extraction', async () => {
      const report = createMockReport();
      const request = createMockRequest(['field1']);
      const cachedReader = createMockCachedReader(
        [{ name: 'field1', storageFieldType: 'STRING' }],
        [{ rows: [['value1'], ['value2']], nextBatchId: undefined }]
      );

      const { response, meta } = await service.getData(request, report, cachedReader, true);

      expect(response.schema).toHaveLength(1);
      expect(response.rows).toHaveLength(2);
      expect(response.filtersApplied).toEqual([]);
      expect(meta.limitExceeded).toBe(false);
      expect(meta.rowsSent).toBe(2);
      expect(meta.limitReason).toBeUndefined();
    });

    it('blended COUNT on STRING field → schema carries NUMBER (regression fix)', async () => {
      typeMapperService.buildSchemaField.mockImplementation((header: ReportDataHeader) => ({
        name: header.name,
        label: header.alias || header.name,
        dataType: FieldDataType.NUMBER,
        semantics: { conceptType: FieldConceptType.METRIC, isReaggregatable: true },
        defaultAggregationType: AggregationType.SUM,
      }));

      const report = createMockReport();
      const request = createMockRequest(['b_count']);
      const cachedReader = createMockCachedReader(
        [{ name: 'b_count', storageFieldType: 'INTEGER', aggregateFunction: 'COUNT' }],
        [{ rows: [[42]], nextBatchId: undefined }]
      );

      const { response } = await service.getData(request, report, cachedReader, false);

      expect(response.schema[0].dataType).toBe(FieldDataType.NUMBER);
    });
  });

  describe('getSchema ↔ getData dataType agreement', () => {
    it('same headers → schema service and data service produce identical dataType per field', async () => {
      const module = await Test.createTestingModule({
        providers: [
          LookerStudioTypeMapperService,
          LookerStudioAggregationMapperService,
          LookerStudioConnectorApiDataService,
        ],
      }).compile();

      const realDataService = module.get(LookerStudioConnectorApiDataService);
      const realTypeMapper = module.get(LookerStudioTypeMapperService);

      (realDataService as any).logger = {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      };

      const storageType = DataStorageType.GOOGLE_BIGQUERY;

      const headers: ReportDataHeader[] = [
        new ReportDataHeader('native_str', 'Native Str', undefined, BigQueryFieldType.STRING),
        new ReportDataHeader('native_int', 'Native Int', undefined, BigQueryFieldType.INTEGER),
        new ReportDataHeader('b_count', 'B Count', undefined, BigQueryFieldType.INTEGER, 'COUNT'),
        new ReportDataHeader(
          'b_cnt_dist',
          'B Cnt Dist',
          undefined,
          BigQueryFieldType.INTEGER,
          'COUNT_DISTINCT'
        ),
        new ReportDataHeader(
          'b_str_agg',
          'B Str Agg',
          undefined,
          BigQueryFieldType.STRING,
          'STRING_AGG'
        ),
        new ReportDataHeader('b_max_date', 'B Max Date', undefined, BigQueryFieldType.DATE, 'MAX'),
        new ReportDataHeader('b_max_int', 'B Max Int', undefined, BigQueryFieldType.INTEGER, 'MAX'),
        new ReportDataHeader(
          'b_any_int',
          'B Any Int',
          undefined,
          BigQueryFieldType.INTEGER,
          'ANY_VALUE'
        ),
      ];

      const schemaDataTypes = headers.map(
        h => realTypeMapper.buildSchemaField(h, storageType).dataType
      );

      const report = createMockReport();
      const request = createMockRequest(headers.map(h => h.name));
      const cachedReader: CachedReaderData = {
        fromCache: false,
        dataDescription: { dataHeaders: headers },
        reader: {
          readReportDataBatch: jest.fn().mockResolvedValue({
            dataRows: [headers.map(() => null)],
            nextDataBatchId: null,
          }),
        },
      } as unknown as CachedReaderData;

      const { response } = await realDataService.getData(request, report, cachedReader, false);

      const responseDataTypes = response.schema.map(
        (s: { name: string; dataType: FieldDataType }) => s.dataType
      );

      expect(responseDataTypes).toEqual(schemaDataTypes);
    });
  });
});
