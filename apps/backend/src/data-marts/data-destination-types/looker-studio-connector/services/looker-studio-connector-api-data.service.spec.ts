/* eslint-disable @typescript-eslint/no-explicit-any */
import { Response } from 'express';
import { LookerStudioConnectorApiDataService } from './looker-studio-connector-api-data.service';
import { LookerStudioTypeMapperService } from './looker-studio-type-mapper.service';
import { CachedReaderData } from '../../../dto/domain/cached-reader-data.dto';
import { Report } from '../../../entities/report.entity';
import { DataStorageType } from '../../../data-storage-types/enums/data-storage-type.enum';
import { GetDataRequest } from '../schemas/get-data.schema';
import { FieldDataType } from '../enums/field-data-type.enum';

describe('LookerStudioConnectorApiDataService', () => {
  let service: LookerStudioConnectorApiDataService;
  let typeMapperService: jest.Mocked<LookerStudioTypeMapperService>;

  beforeEach(() => {
    typeMapperService = {
      mapToLookerStudioDataType: jest.fn().mockReturnValue(FieldDataType.STRING),
    } as unknown as jest.Mocked<LookerStudioTypeMapperService>;

    service = new LookerStudioConnectorApiDataService(typeMapperService);
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
    headers: Array<{ name: string; storageFieldType: string }>,
    batches: Array<{ rows: unknown[][]; nextBatchId?: string }>
  ): CachedReaderData => {
    let batchIndex = 0;

    return {
      fromCache: true,
      dataDescription: {
        dataHeaders: headers.map(h => ({
          name: h.name,
          storageFieldType: h.storageFieldType,
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
    chunks: string[];
    headers: Record<string, string>;
  } => {
    const chunks: string[] = [];
    const headers: Record<string, string> = {};

    const res: Partial<Response> = {
      setHeader: jest.fn((key: string, value: string) => {
        headers[key] = value;
        return res as Response;
      }),
      write: jest.fn((chunk: string) => {
        chunks.push(chunk);
        return true;
      }),
      end: jest.fn(),
    };

    return { res, chunks, headers };
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
  });

  describe('streamData', () => {
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

      const rowCount = await service.streamData(res as Response, context as any);

      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Transfer-Encoding']).toBe('chunked');
      expect(rowCount).toBe(2);
      expect(res.end).toHaveBeenCalled();

      // Verify JSON structure
      const fullResponse = chunks.join('');
      const parsed = JSON.parse(fullResponse);
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

      const rowCount = await service.streamData(res as Response, context as any);

      expect(rowCount).toBe(3);

      const fullResponse = chunks.join('');
      const parsed = JSON.parse(fullResponse);
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

      const rowCount = await service.streamData(res as Response, context as any);

      expect(rowCount).toBe(3);

      const fullResponse = chunks.join('');
      const parsed = JSON.parse(fullResponse);
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

      await service.streamData(res as Response, context as any);

      const fullResponse = chunks.join('');
      const parsed = JSON.parse(fullResponse);
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

      const rowCount = await service.streamData(res as Response, context as any);

      expect(rowCount).toBe(0);

      const fullResponse = chunks.join('');
      const parsed = JSON.parse(fullResponse);
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

      const response = await service.getData(request, report, cachedReader, true);

      expect(response.schema).toHaveLength(1);
      expect(response.rows).toHaveLength(2);
      expect(response.filtersApplied).toEqual([]);
    });
  });
});
