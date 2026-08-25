import { ReportDataHeader } from '../../../dto/domain/report-data-header.dto';
import { Report } from '../../../entities/report.entity';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartSchemaFieldStatus } from '../../enums/data-mart-schema-field-status.enum';
import { AthenaFieldType } from '../enums/athena-field-type.enum';
import { AthenaReportReader } from './athena-report-reader.service';

describe('AthenaReportReader', () => {
  const createReport = (): Report =>
    ({
      dataMart: {
        storage: {
          id: 'storage-1',
          type: DataStorageType.AWS_ATHENA,
          config: {
            region: 'us-east-1',
            outputBucket: 'my-bucket',
          },
          credential: {
            accessKeyId: 'AKID',
            secretAccessKey: 'SECRET',
          },
        },
        definition: {
          type: 'TABLE',
          fullyQualifiedName: 'db.schema.table',
        },
        schema: {
          type: 'athena-data-mart-schema',
          fields: [
            {
              name: 'channel',
              type: AthenaFieldType.STRING,
              status: DataMartSchemaFieldStatus.CONNECTED,
            },
          ],
        },
      },
    }) as unknown as Report;

  it('passes sqlOverride and sqlOverrideParams to athenaAdapter.executeQuery', async () => {
    const overrideSql = 'SELECT channel FROM sessions WHERE channel = ?';
    const overrideParams = [{ name: 'p0', value: 'paid' }];

    const athenaAdapter = {
      executeQuery: jest.fn().mockResolvedValue({ queryExecutionId: 'q1' }),
      waitForQueryToComplete: jest.fn().mockResolvedValue(undefined),
      getQueryResults: jest.fn().mockResolvedValue({
        ResultSet: {
          Rows: [
            // header row
            { Data: [{ VarCharValue: 'channel' }] },
            // data row
            { Data: [{ VarCharValue: 'paid' }] },
          ],
          ResultSetMetadata: {
            ColumnInfo: [{ Name: 'channel' }],
          },
        },
        NextToken: undefined,
      }),
    };

    const athenaAdapterFactory = {
      createFromStorage: jest.fn().mockResolvedValue(athenaAdapter),
    };
    const s3AdapterFactory = {
      createFromStorage: jest.fn().mockResolvedValue({
        cleanupOutputFiles: jest.fn().mockResolvedValue(undefined),
      }),
    };
    const athenaQueryBuilder = {
      // buildQuery result won't be used because sqlOverride is set; still needs to exist
      buildQuery: jest.fn().mockReturnValue('SELECT * FROM db.schema.table'),
    };
    const headersGenerator = {
      generateHeaders: jest.fn().mockReturnValue([new ReportDataHeader('channel')]),
    };

    const reader = new AthenaReportReader(
      athenaAdapterFactory as never,
      s3AdapterFactory as never,
      athenaQueryBuilder as never,
      headersGenerator as never
    );

    await reader.prepareReportData(createReport(), {
      sqlOverride: overrideSql,
      sqlOverrideParams: overrideParams,
    });

    // Trigger the read path so executeQuery is invoked
    try {
      await reader.readReportDataBatch(undefined, 10);
    } catch {
      // If post-processing throws for any reason, we still assert the call below
    }

    // The key assertion: params must reach the adapter
    expect(athenaAdapter.executeQuery).toHaveBeenCalledWith(
      overrideSql,
      'my-bucket',
      expect.any(String),
      overrideParams
    );
  });

  describe('maxDataRows means DATA rows, not Athena result rows', () => {
    const VALUES = ['paid', 'organic', 'direct'];

    /**
     * Athena's own accounting: the first page of a SELECT carries the column names as row 0, and
     * `MaxResults` caps the page INCLUDING that row. Modelling the truncation here is what makes
     * these assertions measure returned rows rather than the argument the reader happened to pass.
     */
    const athenaPage = (batchId: string | undefined, maxResults: number) => {
      const rows = [
        ...(batchId ? [] : [{ Data: [{ VarCharValue: 'channel' }] }]),
        ...VALUES.map(value => ({ Data: [{ VarCharValue: value }] })),
      ].slice(0, maxResults);
      return {
        ResultSet: { Rows: rows, ResultSetMetadata: { ColumnInfo: [{ Name: 'channel' }] } },
        NextToken: 'next-page',
      };
    };

    const buildReader = (): { reader: AthenaReportReader; getQueryResults: jest.Mock } => {
      const getQueryResults = jest
        .fn()
        .mockImplementation(async (_id: string, batchId: string | undefined, maxResults: number) =>
          athenaPage(batchId, maxResults)
        );
      const athenaAdapter = {
        executeQuery: jest.fn().mockResolvedValue({ queryExecutionId: 'q1' }),
        waitForQueryToComplete: jest.fn().mockResolvedValue(undefined),
        getQueryResults,
      };
      const reader = new AthenaReportReader(
        { createFromStorage: jest.fn().mockResolvedValue(athenaAdapter) } as never,
        {
          createFromStorage: jest
            .fn()
            .mockResolvedValue({ cleanupOutputFiles: jest.fn().mockResolvedValue(undefined) }),
        } as never,
        { buildQuery: jest.fn().mockReturnValue('SELECT channel FROM db.schema.table') } as never,
        { generateHeaders: jest.fn().mockReturnValue([new ReportDataHeader('channel')]) } as never
      );
      return { reader, getQueryResults };
    };

    // `ReportTotalsService` reads the single totals row with exactly this budget: one short and the
    // whole Totals block silently becomes null, on EVERY Athena report.
    it('returns one data row for maxDataRows = 1', async () => {
      const { reader } = buildReader();

      await reader.prepareReportData(createReport());
      const batch = await reader.readReportDataBatch(undefined, 1);

      expect(batch.dataRows).toEqual([['paid']]);
    });

    it('returns exactly maxDataRows data rows on the first page — no more, no fewer', async () => {
      const { reader } = buildReader();

      await reader.prepareReportData(createReport());
      const batch = await reader.readReportDataBatch(undefined, 2);

      expect(batch.dataRows).toEqual([['paid'], ['organic']]);
    });

    it('leaves the budget alone on a continuation page, which carries no header row', async () => {
      const { reader, getQueryResults } = buildReader();

      await reader.prepareReportData(createReport());
      const batch = await reader.readReportDataBatch('token-2', 2);

      expect(getQueryResults).toHaveBeenCalledWith('q1', 'token-2', 2);
      expect(batch.dataRows).toEqual([['paid'], ['organic']]);
    });
  });
});
