import { Logger } from '@nestjs/common';
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

  it('passes the table reference memo to composeTotals', async () => {
    const { service, reportSqlComposerService } = createService();
    const memo = new Map<string, Promise<string>>();

    await service.computeTotals(
      buildReport(),
      {} as never,
      DataStorageType.GOOGLE_BIGQUERY,
      undefined,
      undefined,
      memo
    );

    expect(reportSqlComposerService.composeTotals.mock.calls[0][2]).toBe(memo);
  });

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
    // numeric-field plan (columns + aggregations); Unique Count is not part of totals.
    expect(reader.prepareReportData).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sqlOverride: 'SELECT SUM(...)',
        columnFilter: ['revenue', 'orders'],
        aggregationConfig: [
          { column: 'revenue', function: 'SUM' },
          { column: 'orders', function: 'COUNT_DISTINCT' },
        ],
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

  // Defence-in-depth against a composeTotals result shaped like this (a stray SUM/AVG/MIN/MAX
  // rule alongside the correct calculatedFields entry — the real deriveTotalsAggregations no
  // longer produces one, since an aggregate-level calculated field is already an aggregate). ReportTotalsService
  // must not let such rules reach the header list even so: the metric's name must be stripped
  // from columnFilter (or the aggregation-expansion loop turns one SQL column into four headers)
  // and calculatedFields must be forwarded so the ONE correct, typed header is synthesized.
  it('excludes a calculated field from columnFilter and forwards calculatedFields for header synthesis', async () => {
    const composeTotals = jest.fn().mockResolvedValue({
      sql: 'SELECT SUM(`revenue`) AS `revenue | SUM`, SUM(`clicks`) / NULLIF(SUM(`impressions`), 0) AS `ctr`',
      params: [],
      columns: ['revenue', 'ctr'],
      aggregations: [
        { column: 'revenue', function: 'SUM' },
        { column: 'ctr', function: 'SUM' },
        { column: 'ctr', function: 'AVG' },
        { column: 'ctr', function: 'MIN' },
        { column: 'ctr', function: 'MAX' },
      ],
      calculatedFields: [
        {
          outputName: 'ctr',
          type: 'FLOAT',
          formula: 'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)',
        },
      ],
    });
    const { service, reader } = createService({ composeTotals });

    await service.computeTotals(buildReport(), {} as never, DataStorageType.GOOGLE_BIGQUERY);

    expect(reader.prepareReportData).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        // 'ctr' removed — it renders through calculatedFields, not the plain projection.
        columnFilter: ['revenue'],
        calculatedFields: [expect.objectContaining({ outputName: 'ctr', type: 'FLOAT' })],
      })
    );
  });

  it('resolves a FRESH reader from the resolver for the report storage type', async () => {
    const { service, readerResolver } = createService();

    await service.computeTotals(buildReport(), {} as never, DataStorageType.GOOGLE_BIGQUERY);

    expect(readerResolver.resolve).toHaveBeenCalledWith(DataStorageType.GOOGLE_BIGQUERY);
  });

  it('forwards queryTimeoutMs into the reader prepareReportData options (Phase 3)', async () => {
    const { service, reader } = createService();

    await service.computeTotals(buildReport(), {} as never, DataStorageType.GOOGLE_BIGQUERY, 30000);

    expect(reader.prepareReportData).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ queryTimeoutMs: 30000 })
    );
  });

  it('omits queryTimeoutMs from the reader options when none is passed (regression)', async () => {
    const { service, reader } = createService();

    await service.computeTotals(buildReport(), {} as never, DataStorageType.GOOGLE_BIGQUERY);

    expect(reader.prepareReportData.mock.calls[0][1]).not.toHaveProperty('queryTimeoutMs');
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
  describe('computeRowCount', () => {
    const plan = { dataMart: { id: 'dm-1' } } as never;

    const setup = (cell: unknown, readerOverrides: Record<string, jest.Mock> = {}) => {
      const reader = {
        prepareReportData: jest.fn().mockResolvedValue(new ReportDataDescription([])),
        readReportDataBatch: jest
          .fn()
          .mockResolvedValue(new ReportDataBatch(cell === undefined ? [] : [[cell]], null)),
        finalize: jest.fn().mockResolvedValue(undefined),
        ...readerOverrides,
      };
      const composeRowCount = jest.fn().mockResolvedValue({
        sql: 'SELECT COUNT(*) AS total_row_count FROM (x) AS total_row_count_source',
        params: [{ name: 'p0', value: 1 }],
        alias: 'total_row_count',
      });
      const service = new ReportTotalsService(
        { resolve: jest.fn().mockResolvedValue(reader) } as never,
        { composeRowCount } as never
      );
      return { service, reader, composeRowCount };
    };

    it('returns the count from the first cell', async () => {
      const { service, reader, composeRowCount } = setup(12);
      const accessor = { userId: 'u', roles: ['admin'] } as never;

      const result = await service.computeRowCount(plan, accessor, DataStorageType.GOOGLE_BIGQUERY);

      expect(result).toBe(12);
      expect(composeRowCount).toHaveBeenCalledWith(plan, accessor, undefined);
      expect(reader.prepareReportData).toHaveBeenCalledWith(
        plan,
        expect.objectContaining({
          sqlOverride: 'SELECT COUNT(*) AS total_row_count FROM (x) AS total_row_count_source',
          sqlOverrideParams: [{ name: 'p0', value: 1 }],
          columnFilter: ['total_row_count'],
        })
      );
      expect(reader.readReportDataBatch).toHaveBeenCalledWith(undefined, 1);
    });

    it('passes the table reference memo to the composer', async () => {
      const { service, composeRowCount } = setup(1);
      const memo = new Map<string, Promise<string>>();

      await service.computeRowCount(
        plan,
        {} as never,
        DataStorageType.GOOGLE_BIGQUERY,
        undefined,
        undefined,
        memo
      );

      expect(composeRowCount.mock.calls[0][2]).toBe(memo);
    });

    it.each([
      ['a digit string', '12', 12],
      ['a bigint', 12n, 12],
      ['zero', 0, 0],
    ])('converts %s', async (_name, cell, expected) => {
      const { service } = setup(cell);

      await expect(
        service.computeRowCount(plan, {} as never, DataStorageType.GOOGLE_BIGQUERY)
      ).resolves.toBe(expected);
    });

    it('throws when the count query returns no row', async () => {
      const { service } = setup(undefined);

      await expect(
        service.computeRowCount(plan, {} as never, DataStorageType.GOOGLE_BIGQUERY)
      ).rejects.toThrow();
    });

    it.each([
      [null],
      [''],
      ['abc'],
      [-1],
      [1.5],
      [-1n],
      [true],
      ['9007199254740993'],
      [9007199254740993n],
    ])('throws on %p, which is not a count', async cell => {
      const { service } = setup(cell);

      await expect(
        service.computeRowCount(plan, {} as never, DataStorageType.GOOGLE_BIGQUERY)
      ).rejects.toThrow();
    });

    it('passes the time limit and the signal only when given', async () => {
      const given = setup(1);
      const signal = new AbortController().signal;
      await given.service.computeRowCount(
        plan,
        {} as never,
        DataStorageType.GOOGLE_BIGQUERY,
        5000,
        signal
      );
      expect(given.reader.prepareReportData.mock.calls[0][1]).toEqual(
        expect.objectContaining({ queryTimeoutMs: 5000, signal })
      );

      const omitted = setup(1);
      await omitted.service.computeRowCount(plan, {} as never, DataStorageType.GOOGLE_BIGQUERY);
      const options = omitted.reader.prepareReportData.mock.calls[0][1];
      expect(options).not.toHaveProperty('queryTimeoutMs');
      expect(options).not.toHaveProperty('signal');
    });

    it('finalizes the reader on success and on a read failure', async () => {
      const ok = setup(1);
      await ok.service.computeRowCount(plan, {} as never, DataStorageType.GOOGLE_BIGQUERY);
      expect(ok.reader.finalize).toHaveBeenCalledTimes(1);

      const failing = setup(1, {
        readReportDataBatch: jest.fn().mockRejectedValue(new Error('boom')),
      });
      await expect(
        failing.service.computeRowCount(plan, {} as never, DataStorageType.GOOGLE_BIGQUERY)
      ).rejects.toThrow('boom');
      expect(failing.reader.finalize).toHaveBeenCalledTimes(1);
    });

    it('keeps the count when the reader fails to finalize', async () => {
      const { service } = setup(7, {
        finalize: jest.fn().mockRejectedValue(new Error('close failed')),
      });
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

      await expect(
        service.computeRowCount(plan, {} as never, DataStorageType.GOOGLE_BIGQUERY)
      ).resolves.toBe(7);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('close failed'));
      warn.mockRestore();
    });

    it('does not prepare the read when the signal is already aborted', async () => {
      const { service, reader } = setup(1);
      const controller = new AbortController();
      controller.abort(new Error('late'));

      await expect(
        service.computeRowCount(
          plan,
          {} as never,
          DataStorageType.GOOGLE_BIGQUERY,
          undefined,
          controller.signal
        )
      ).rejects.toThrow('late');
      expect(reader.prepareReportData).not.toHaveBeenCalled();
    });

    it('does not read when the signal aborts while the read prepares', async () => {
      const controller = new AbortController();
      const { service, reader } = setup(1, {
        prepareReportData: jest.fn().mockImplementation(() => {
          controller.abort(new Error('late'));
          return Promise.resolve(new ReportDataDescription([]));
        }),
      });

      await expect(
        service.computeRowCount(
          plan,
          {} as never,
          DataStorageType.GOOGLE_BIGQUERY,
          undefined,
          controller.signal
        )
      ).rejects.toThrow('late');
      expect(reader.readReportDataBatch).not.toHaveBeenCalled();
    });
  });
});
