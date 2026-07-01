import { ReportTotalsService } from './report-totals.service';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { ReportDataBatch } from '../dto/domain/report-data-batch.dto';
import { ReportDataDescription } from '../dto/domain/report-data-description.dto';
import { ReportDataHeader } from '../dto/domain/report-data-header.dto';
import { Report } from '../entities/report.entity';

describe('ReportTotalsService', () => {
  const buildReport = (overrides: Partial<Report> = {}): Report =>
    ({
      id: 'rep-1',
      dataMart: {
        id: 'dm-1',
        projectId: 'proj-1',
        storage: { id: 'storage-1', type: DataStorageType.GOOGLE_BIGQUERY },
      },
      ...overrides,
    }) as unknown as Report;

  const createReader = (
    headers: ReportDataHeader[],
    row: unknown[] | undefined
  ): jest.Mocked<{
    prepareReportData: jest.Mock;
    readReportDataBatch: jest.Mock;
    finalize: jest.Mock;
  }> =>
    ({
      prepareReportData: jest.fn().mockResolvedValue(new ReportDataDescription(headers)),
      readReportDataBatch: jest.fn().mockResolvedValue(new ReportDataBatch(row ? [row] : [], null)),
      finalize: jest.fn().mockResolvedValue(undefined),
    }) as never;

  const createService = (
    overrides: {
      composeTotals?: jest.Mock;
      reader?: ReturnType<typeof createReader>;
    } = {}
  ) => {
    const reader =
      overrides.reader ??
      createReader(
        [new ReportDataHeader('revenue | SUM'), new ReportDataHeader('orders | COUNTUNIQUE')],
        [123.5, 10]
      );
    const readerResolver = { resolve: jest.fn().mockResolvedValue(reader) };
    const reportSqlComposerService = {
      composeTotals:
        overrides.composeTotals ??
        jest.fn().mockResolvedValue({
          sql: 'SELECT SUM(...)',
          params: [],
          columns: ['revenue', 'orders'],
          aggregations: [
            { column: 'revenue', function: 'SUM' },
            { column: 'orders', function: 'COUNT_DISTINCT' },
          ],
        }),
    };
    const service = new ReportTotalsService(
      readerResolver as never,
      reportSqlComposerService as never
    );
    return { service, readerResolver, reportSqlComposerService, reader };
  };

  it('non-aggregated report (composeTotals → null) returns null and never resolves a reader', async () => {
    const composeTotals = jest.fn().mockResolvedValue(null);
    const { service, readerResolver } = createService({ composeTotals });

    const result = await service.computeTotals(
      buildReport(),
      {} as never,
      DataStorageType.GOOGLE_BIGQUERY
    );

    expect(result).toBeNull();
    expect(readerResolver.resolve).not.toHaveBeenCalled();
  });

  it('aggregated report maps the single row to a flat {header.name: value} object', async () => {
    const { service, reportSqlComposerService, reader } = createService();

    const result = await service.computeTotals(
      buildReport(),
      {} as never,
      DataStorageType.GOOGLE_BIGQUERY
    );

    expect(reportSqlComposerService.composeTotals).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      'revenue | SUM': 123.5,
      'orders | COUNTUNIQUE': 10,
    });
    // Executes the totals SQL as an override and resolves headers from the SAME derived
    // numeric-field plan (columns + aggregations), opting out of Row Count / Unique Count.
    expect(reader.prepareReportData).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sqlOverride: 'SELECT SUM(...)',
        columnFilter: ['revenue', 'orders'],
        aggregationConfig: [
          { column: 'revenue', function: 'SUM' },
          { column: 'orders', function: 'COUNT_DISTINCT' },
        ],
        rowCount: false,
      })
    );
    expect(reader.readReportDataBatch).toHaveBeenCalledWith(undefined, 1);
    expect(reader.finalize).toHaveBeenCalled();
  });

  it('forwards composeTotals blendedDataHeaders to the reader so joined-numeric totals resolve a type', async () => {
    const blendedHeader = new ReportDataHeader(
      'partner__cost',
      'Partner cost',
      undefined,
      'FLOAT' as never
    );
    const composeTotals = jest.fn().mockResolvedValue({
      sql: 'SELECT SUM(...)',
      params: [],
      columns: ['partner__cost'],
      aggregations: [{ column: 'partner__cost', function: 'SUM' }],
      blendedDataHeaders: [blendedHeader],
    });
    const { service, reader } = createService({ composeTotals });

    await service.computeTotals(buildReport(), {} as never, DataStorageType.GOOGLE_BIGQUERY);

    expect(reader.prepareReportData).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ blendedDataHeaders: [blendedHeader] })
    );
  });

  it('resolves a FRESH reader from the resolver for the report storage type', async () => {
    const { service, readerResolver } = createService();

    await service.computeTotals(buildReport(), {} as never, DataStorageType.GOOGLE_BIGQUERY);

    expect(readerResolver.resolve).toHaveBeenCalledWith(DataStorageType.GOOGLE_BIGQUERY);
  });

  it('empty totals dataset (no rows) returns null', async () => {
    const reader = createReader([new ReportDataHeader('revenue | SUM')], undefined);
    const { service } = createService({ reader });

    const result = await service.computeTotals(
      buildReport(),
      {} as never,
      DataStorageType.GOOGLE_BIGQUERY
    );

    expect(result).toBeNull();
    expect(reader.finalize).toHaveBeenCalled();
  });

  it('finalizes the reader even when reading the totals batch throws', async () => {
    const reader = createReader([new ReportDataHeader('revenue | SUM')], [1]);
    reader.readReportDataBatch.mockRejectedValueOnce(new Error('boom'));
    const { service } = createService({ reader });

    await expect(
      service.computeTotals(buildReport(), {} as never, DataStorageType.GOOGLE_BIGQUERY)
    ).rejects.toThrow('boom');
    expect(reader.finalize).toHaveBeenCalled();
  });
});
