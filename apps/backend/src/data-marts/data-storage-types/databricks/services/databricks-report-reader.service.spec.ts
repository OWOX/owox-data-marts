import { ReportDataHeader } from '../../../dto/domain/report-data-header.dto';
import { Report } from '../../../entities/report.entity';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DatabricksReaderState } from '../interfaces/databricks-reader-state.interface';
import { DatabricksAuthMethod } from '../enums/databricks-auth-method.enum';
import { DatabricksFieldType } from '../enums/databricks-field-type.enum';
import { DataMartSchemaFieldStatus } from '../../enums/data-mart-schema-field-status.enum';
import { DatabricksReportReader } from './databricks-report-reader.service';

describe('DatabricksReportReader', () => {
  const createReport = (): Report =>
    ({
      dataMart: {
        storage: {
          id: 'storage-1',
          type: DataStorageType.DATABRICKS,
          config: {
            host: 'host',
            httpPath: '/sql/warehouse',
          },
          credential: {
            authMethod: DatabricksAuthMethod.PERSONAL_ACCESS_TOKEN,
            token: 'token',
          },
        },
        definition: {
          type: 'TABLE',
          fullyQualifiedName: 'catalog.schema.table',
        },
        schema: {
          type: 'databricks-data-mart-schema',
          table: 'catalog.schema.table',
          fields: [
            {
              name: 'COL1',
              type: DatabricksFieldType.STRING,
              status: DataMartSchemaFieldStatus.CONNECTED,
            },
            {
              name: 'COL2',
              type: DatabricksFieldType.INT,
              status: DataMartSchemaFieldStatus.CONNECTED,
            },
          ],
        },
      },
    }) as unknown as Report;

  it('reads data in chunks and returns next batch id while rows remain', async () => {
    const cursor = {
      queryId: 'query-1',
      fetchChunk: jest
        .fn()
        .mockResolvedValueOnce([{ col1: 'a', col2: 1 }])
        .mockResolvedValueOnce([{ col1: 'b', col2: 2 }]),
      hasMoreRows: jest.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
      close: jest.fn().mockResolvedValue(undefined),
      getColumns: jest.fn(),
    };
    const adapter = {
      openQueryCursor: jest.fn().mockResolvedValue(cursor),
      destroy: jest.fn().mockResolvedValue(undefined),
    };
    const adapterFactory = {
      createFromStorage: jest.fn().mockResolvedValue(adapter),
    };
    const queryBuilder = {
      buildQuery: jest.fn().mockReturnValue('SELECT * FROM table'),
    };
    const headersGenerator = {
      generateHeaders: jest
        .fn()
        .mockReturnValue([new ReportDataHeader('COL1'), new ReportDataHeader('COL2')]),
    };

    const reader = new DatabricksReportReader(
      adapterFactory as never,
      queryBuilder as never,
      headersGenerator as never
    );

    const description = await reader.prepareReportData(createReport());
    expect(description.dataHeaders).toHaveLength(2);
    expect(adapter.openQueryCursor).toHaveBeenCalledWith('SELECT * FROM table');

    const firstBatch = await reader.readReportDataBatch(undefined, 1);
    expect(firstBatch.dataRows).toEqual([['a', 1]]);
    expect(firstBatch.nextDataBatchId).toBe('1');

    const secondBatch = await reader.readReportDataBatch(
      firstBatch.nextDataBatchId ?? undefined,
      1
    );
    expect(secondBatch.dataRows).toEqual([['b', 2]]);
    expect(secondBatch.nextDataBatchId).toBeNull();

    const state = reader.getState();
    expect(state).toEqual({
      type: DataStorageType.DATABRICKS,
      queryId: 'query-1',
      rowsRead: 2,
      hasMore: false,
    });

    await reader.finalize();
    expect(cursor.close).toHaveBeenCalledTimes(1);
    expect(adapter.destroy).toHaveBeenCalledTimes(1);
  });

  it('restores from cached state by skipping already read rows', async () => {
    const cursor = {
      queryId: 'query-2',
      fetchChunk: jest
        .fn()
        .mockResolvedValueOnce([{ col1: 'skip', col2: 0 }])
        .mockResolvedValueOnce([
          { col1: 'keep-1', col2: 1 },
          { col1: 'keep-2', col2: 2 },
        ]),
      hasMoreRows: jest.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
      close: jest.fn().mockResolvedValue(undefined),
      getColumns: jest.fn(),
    };
    const adapter = {
      openQueryCursor: jest.fn().mockResolvedValue(cursor),
      destroy: jest.fn().mockResolvedValue(undefined),
    };
    const adapterFactory = {
      createFromStorage: jest.fn().mockResolvedValue(adapter),
    };
    const queryBuilder = {
      buildQuery: jest.fn().mockReturnValue('SELECT * FROM table'),
    };
    const headersGenerator = {
      generateHeaders: jest
        .fn()
        .mockReturnValue([new ReportDataHeader('COL1'), new ReportDataHeader('COL2')]),
    };

    const reader = new DatabricksReportReader(
      adapterFactory as never,
      queryBuilder as never,
      headersGenerator as never
    );

    await reader.prepareReportData(createReport());

    const cachedState: DatabricksReaderState = {
      type: DataStorageType.DATABRICKS,
      queryId: 'cached-query-id',
      rowsRead: 1,
      hasMore: true,
    };
    await reader.initFromState(cachedState, [
      new ReportDataHeader('COL1'),
      new ReportDataHeader('COL2'),
    ]);

    const batch = await reader.readReportDataBatch(undefined, 2);
    expect(cursor.fetchChunk).toHaveBeenNthCalledWith(1, 1);
    expect(cursor.fetchChunk).toHaveBeenNthCalledWith(2, 2);

    expect(batch.dataRows).toEqual([
      ['keep-1', 1],
      ['keep-2', 2],
    ]);
    expect(batch.nextDataBatchId).toBeNull();

    const state = reader.getState();
    expect(state).toEqual({
      type: DataStorageType.DATABRICKS,
      queryId: 'query-2',
      rowsRead: 3,
      hasMore: false,
    });

    await reader.finalize();
    expect(cursor.close).toHaveBeenCalledTimes(1);
    expect(adapter.destroy).toHaveBeenCalledTimes(1);
  });

  it('still destroys adapter when cursor close fails during finalize', async () => {
    const cursor = {
      queryId: 'query-3',
      fetchChunk: jest.fn().mockResolvedValue([]),
      hasMoreRows: jest.fn().mockResolvedValue(false),
      close: jest.fn().mockRejectedValue(new Error('close failed')),
      getColumns: jest.fn(),
    };
    const adapter = {
      openQueryCursor: jest.fn().mockResolvedValue(cursor),
      destroy: jest.fn().mockResolvedValue(undefined),
    };
    const adapterFactory = {
      createFromStorage: jest.fn().mockResolvedValue(adapter),
    };
    const queryBuilder = {
      buildQuery: jest.fn().mockReturnValue('SELECT * FROM table'),
    };
    const headersGenerator = {
      generateHeaders: jest
        .fn()
        .mockReturnValue([new ReportDataHeader('COL1'), new ReportDataHeader('COL2')]),
    };

    const reader = new DatabricksReportReader(
      adapterFactory as never,
      queryBuilder as never,
      headersGenerator as never
    );

    await reader.prepareReportData(createReport());

    await expect(reader.finalize()).rejects.toThrow('close failed');
    expect(cursor.close).toHaveBeenCalledTimes(1);
    expect(adapter.destroy).toHaveBeenCalledTimes(1);
  });
});
