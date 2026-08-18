import { Logger } from '@nestjs/common';
import { RedshiftReportReader } from './redshift-report-reader.service';
import { ReportDataHeader } from '../../../dto/domain/report-data-header.dto';

/**
 * The Redshift Data API hands back rows as positional `Field[]`, so this reader is the one
 * place where result columns are bound to report headers. It used to do that by POSITION,
 * which silently mismatched every cell once the blended builder started appending
 * metric-sleeve pulls after the non-sleeve select items.
 */
describe('RedshiftReportReader result-column binding', () => {
  const field = (value: string | number | boolean | null) =>
    value === null
      ? { isNull: true }
      : typeof value === 'number'
        ? { longValue: value }
        : typeof value === 'boolean'
          ? { booleanValue: value }
          : { stringValue: value };

  const buildReport = () =>
    ({
      dataMart: {
        storage: { id: 's1' },
        definition: { sqlQuery: 'SELECT 1' },
        schema: { type: 'redshift-data-mart-schema', fields: [] },
      },
    }) as never;

  const createReader = (results: unknown, metadata?: unknown) => {
    const adapter = {
      executeQuery: jest.fn().mockResolvedValue({ statementId: 'st1' }),
      waitForQueryToComplete: jest.fn().mockResolvedValue(undefined),
      getQueryResults: jest.fn().mockResolvedValue(results),
      getQueryResultsMetadata: metadata
        ? jest.fn().mockResolvedValue(metadata)
        : jest.fn().mockRejectedValue(new Error('No result columns metadata available')),
    };
    const adapterFactory = { createFromStorage: jest.fn().mockResolvedValue(adapter) };
    const queryBuilder = { buildQuery: jest.fn().mockReturnValue('SELECT built') };
    const headersGenerator = { generateHeaders: jest.fn().mockReturnValue([]) };
    const reader = new RedshiftReportReader(
      adapterFactory as never,
      queryBuilder as never,
      headersGenerator as never
    );
    return { reader, adapter };
  };

  it('binds cells to headers by column name, not by result position ( sleeve order)', async () => {
    // The SQL a blended aggregated report emits: dimension, non-sleeve metrics,
    // and THEN the sleeve pull — while the header list puts `| SUM` at its column's position.
    const { reader } = createReader({
      ColumnMetadata: [
        { label: 'country' },
        { label: 'orders__amount | MIN' },
        { label: 'orders__amount | MAX' },
        { label: 'orders__amount | SUM' },
      ],
      Records: [[field('US'), field(1), field(9), field(150)]],
    });

    await reader.prepareReportData(buildReport(), {
      columnFilter: ['country', 'orders__amount'],
      aggregationConfig: [
        { column: 'orders__amount', function: 'SUM' },
        { column: 'orders__amount', function: 'MIN' },
        { column: 'orders__amount', function: 'MAX' },
      ],
    } as never);

    const batch = await reader.readReportDataBatch();

    // Header order is country, SUM, MIN, MAX — each cell must carry ITS value.
    expect(batch.dataRows).toEqual([['US', 150, 1, 9]]);
  });

  // Redshift's default `enable_case_sensitive_identifier = off` lower-cases even a quoted
  // alias, so `"orders__amount | SUM"` comes back labelled `orders__amount | sum`. Exact-only
  // matching would leave every aggregated cell empty.
  it('matches a case-folded result label against its header name', async () => {
    const { reader } = createReader({
      ColumnMetadata: [{ label: 'country' }, { label: 'orders__amount | sum' }],
      Records: [[field('US'), field(150)]],
    });

    await reader.prepareReportData(buildReport(), {
      columnFilter: ['country', 'orders__amount'],
      aggregationConfig: [{ column: 'orders__amount', function: 'SUM' }],
    } as never);

    const batch = await reader.readReportDataBatch();

    expect(batch.dataRows).toEqual([['US', 150]]);
  });

  it('prefers an exact label match over a case-folded one', async () => {
    const { reader } = createReader({
      ColumnMetadata: [{ label: 'Total' }, { label: 'total' }],
      Records: [[field(1), field(2)]],
    });

    await reader.prepareReportData(buildReport(), { columnFilter: ['total'] } as never);

    const batch = await reader.readReportDataBatch();

    expect(batch.dataRows).toEqual([[2]]);
  });

  // A header with no matching result column used to yield a column of empty cells — invisible.
  // The Athena reader throws for the same mismatch; this one now does too.
  it('fails loud when a header matches no result column', async () => {
    const { reader } = createReader({
      ColumnMetadata: [{ label: 'country' }],
      Records: [[field('US')]],
    });

    await reader.prepareReportData(buildReport(), {
      columnFilter: ['country', 'missing'],
    } as never);

    await expect(reader.readReportDataBatch()).rejects.toThrow(
      /Column\(s\) \[missing\] not found in query results.*country/
    );
  });

  it('preserves null / boolean / double field values', async () => {
    const { reader } = createReader({
      ColumnMetadata: [{ label: 'a' }, { label: 'b' }, { label: 'c' }],
      Records: [[{ isNull: true }, { booleanValue: false }, { doubleValue: 1.5 }]],
    });

    await reader.prepareReportData(buildReport(), {
      columnFilter: ['a', 'b', 'c'],
    } as never);

    const batch = await reader.readReportDataBatch();

    expect(batch.dataRows).toEqual([[null, false, 1.5]]);
  });

  it('reuses the first page column metadata for a follow-up page that omits it', async () => {
    const { reader, adapter } = createReader({
      ColumnMetadata: [{ label: 'country' }, { label: 'amount' }],
      Records: [[field('US'), field(4)]],
      NextToken: 'page2',
    });

    await reader.prepareReportData(buildReport(), {
      columnFilter: ['country', 'amount'],
    } as never);
    await reader.readReportDataBatch();

    adapter.getQueryResults.mockResolvedValueOnce({
      Records: [[field('DE'), field(2)]],
    });
    const second = await reader.readReportDataBatch('page2');

    expect(second.dataRows).toEqual([['DE', 2]]);
  });

  // A reader restored from a cached state resumes mid-pagination, so the first page it sees
  // may be a token-ed one. If that page omits metadata, ask the API for it rather than failing
  // the read (the old positional mapping never needed metadata at all).
  it('fetches statement metadata explicitly when the first page it sees omits it', async () => {
    const { reader, adapter } = createReader({ Records: [[field(7), field('UA')]] }, [
      { label: 'amount' },
      { label: 'country' },
    ]);

    await reader.prepareReportData(buildReport(), {
      columnFilter: ['country', 'amount'],
    } as never);

    const batch = await reader.readReportDataBatch('page2');

    expect(adapter.getQueryResultsMetadata).toHaveBeenCalledWith('st1');
    expect(batch.dataRows).toEqual([['UA', 7]]);
  });

  it('fails loud when neither the page nor the statement exposes column metadata', async () => {
    const { reader } = createReader({ Records: [[field('US')]] });

    await reader.prepareReportData(buildReport(), { columnFilter: ['country'] } as never);

    await expect(reader.readReportDataBatch()).rejects.toThrow(
      /No result columns metadata available/
    );
  });

  // Redshift cuts every identifier to 127 bytes, so a long metric alias reaches ColumnMetadata
  // already shortened — name binding must follow it there, or a report that the old positional
  // mapping read fine now fails outright.
  it('binds a header whose alias Redshift truncated to the 127-byte limit', async () => {
    const longColumn = `orders__${'campaign_source_medium_'.repeat(6)}revenue`;
    const headerName = `${longColumn} | SUM`;
    expect(Buffer.byteLength(headerName, 'utf8')).toBeGreaterThan(127);
    // ASCII, so Redshift's byte cut lands on the same offset a character cut would.
    const truncatedLabel = headerName.toLowerCase().slice(0, 127);

    const { reader } = createReader({
      ColumnMetadata: [{ label: 'country' }, { label: truncatedLabel }],
      Records: [[field('US'), field(150)]],
    });

    await reader.prepareReportData(buildReport(), {
      columnFilter: ['country', longColumn],
      aggregationConfig: [{ column: longColumn, function: 'SUM' }],
    } as never);

    const batch = await reader.readReportDataBatch();

    expect(batch.dataRows).toEqual([['US', 150]]);
  });

  // The limit is 127 BYTES: a two-byte-per-character name is cut at half the characters, and
  // the cut never straddles a character. A JS `slice(0, 127)` would look for a label twice as
  // long as the one Redshift actually returns.
  it('cuts a multi-byte header at the byte limit without splitting a character', async () => {
    const headerName = 'é'.repeat(70);
    const truncatedLabel = 'é'.repeat(63);

    const { reader } = createReader({
      ColumnMetadata: [{ label: 'country' }, { label: truncatedLabel }],
      Records: [[field('US'), field(5)]],
    });

    await reader.prepareReportData(buildReport(), {
      columnFilter: ['country', headerName],
    } as never);

    const batch = await reader.readReportDataBatch();

    expect(batch.dataRows).toEqual([['US', 5]]);
  });

  // Case folding makes two distinct headers claim one result column: both would show that
  // column's values, under two different names, and the report would look plausible.
  it('fails loud when two case-colliding headers claim one result column', async () => {
    const { reader } = createReader({
      ColumnMetadata: [{ label: 'revenue' }],
      Records: [[field(10)]],
    });

    await reader.prepareReportData(buildReport(), {
      columnFilter: ['Revenue', 'revenue'],
    } as never);

    await expect(reader.readReportDataBatch()).rejects.toThrow(
      "'Revenue' and 'revenue' both match 'revenue'"
    );
  });

  it('fails loud when two headers collide only past the 127-byte cut', async () => {
    const shared = `orders__${'x'.repeat(130)}`;
    const truncatedLabel = shared.slice(0, 127);

    const { reader } = createReader({
      ColumnMetadata: [{ label: truncatedLabel }],
      Records: [[field(1)]],
    });

    await reader.prepareReportData(buildReport(), {
      columnFilter: [`${shared} | SUM`, `${shared} | AVG`],
    } as never);

    await expect(reader.readReportDataBatch()).rejects.toThrow(
      /'.*\| SUM' and '.*\| AVG' both match 'orders__x+'/
    );
  });

  // Duplicated labels in an SQL override's own SELECT are a different situation: the
  // duplication is in the data, each name still has exactly one header, and the read is usable.
  it('only warns when the result itself carries duplicate labels', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { reader } = createReader({
      ColumnMetadata: [{ label: 'dup' }, { label: 'dup' }],
      Records: [[field(1), field(2)]],
    });

    await reader.prepareReportData(buildReport(), { columnFilter: ['dup'] } as never);

    const batch = await reader.readReportDataBatch();

    expect(batch.dataRows).toEqual([[1]]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('duplicate column label(s) [dup]'));
    warn.mockRestore();
  });

  it('binds restored-state reads by name too', async () => {
    const { reader } = createReader({
      ColumnMetadata: [{ label: 'amount' }, { label: 'country' }],
      Records: [[field(7), field('UA')]],
    });

    // Real continuation flow: the reader is constructed and prepared, then the persisted
    // statement + header list are restored over it.
    await reader.prepareReportData(buildReport(), { columnFilter: ['country'] } as never);
    await reader.initFromState({ type: 'AWS_REDSHIFT', statementId: 'st1' } as never, [
      new ReportDataHeader('country'),
      new ReportDataHeader('amount'),
    ]);

    const batch = await reader.readReportDataBatch();

    expect(batch.dataRows).toEqual([['UA', 7]]);
  });
});
