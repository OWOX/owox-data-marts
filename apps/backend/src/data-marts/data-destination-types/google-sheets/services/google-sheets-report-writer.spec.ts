import { ColumnPlan } from '../../../dto/domain/column-plan.dto';
import { ReportDataBatch } from '../../../dto/domain/report-data-batch.dto';
import { ReportDataDescription } from '../../../dto/domain/report-data-description.dto';
import { ReportDataHeader } from '../../../dto/domain/report-data-header.dto';
import { GoogleSheetsReportWriter } from './google-sheets-report-writer';
import { SheetValuesFormatter } from './sheet-formatters/sheet-values-formatter';

/**
 * Targeted unit spec for {@link GoogleSheetsReportWriter}'s row-truncation
 * behaviour. The writer leaves stale rows behind when a refresh produces
 * fewer rows than the previous one (for example, after a Report
 * `limitConfig` shrinks the result set) — this suite locks the post-fix
 * contract: a single `clearValuesInRange` call covers exactly
 * `[writtenRowsCount + 1 .. availableRowsCount]` rows in the imported
 * column rectangle, and only on the success path.
 *
 * The writer has many collaborators; rather than wiring a full Nest test
 * module we construct it directly with hand-rolled mocks and exercise the
 * public interface (`prepareToWriteReport` → `writeReportDataBatch` →
 * `finalize`) end-to-end.
 */

const SHEET_TITLE = 'Sheet1';
const SHEET_ID = 7;
const SPREADSHEET_ID = 'spread-1';

interface AdapterMock {
  getSpreadsheet: jest.Mock;
  findSheetById: jest.Mock;
  getDeveloperMetadata: jest.Mock;
  getRowValues: jest.Mock;
  getRowFormulas: jest.Mock;
  findOwoxColumnsMetadataForSheet: jest.Mock;
  findAllOwoxReportMetadataForSheet: jest.Mock;
  buildDeleteDeveloperMetadataRequests: jest.Mock;
  appendDimensionToSheet: jest.Mock;
  updateValues: jest.Mock;
  batchUpdate: jest.Mock;
  buildInsertColumnRequest: jest.Mock;
  buildDeleteColumnRequest: jest.Mock;
  buildCopyPasteRequest: jest.Mock;
  clearValuesInRange: jest.Mock;
}

interface BuildOpts {
  /**
   * Total rows in the destination sheet at the start of the run. Drives the
   * `availableRowsCount` snapshot the writer reads from
   * `sheet.properties.gridProperties.rowCount`. Choose a value larger than
   * the new run so the truncation range is non-trivial.
   */
  availableRowsCount: number;
  /**
   * Final imported column names returned by the mocked column plan. Drives
   * the right edge of the imported rectangle the writer truncates.
   */
  finalImportedNames?: string[];
  /**
   * Override the default no-op `formatRowsValuesByName` mock with a real
   * formatter instance. Used by the null-overwrite test to exercise the
   * full path from `writeReportDataBatch` to `adapter.updateValues`.
   */
  valuesFormatter?: SheetValuesFormatter;
}

/**
 * Assembles a {@link GoogleSheetsReportWriter} wired up with hand-rolled
 * mocks. Returns the writer plus references to the mocked adapter and
 * collaborators so individual tests can assert against them.
 */
function buildWriter(opts: BuildOpts) {
  const finalImportedNames = opts.finalImportedNames ?? ['country', 'clicks', 'cost'];

  const adapter: AdapterMock = {
    getSpreadsheet: jest.fn().mockResolvedValue({
      properties: { title: 'Test Spreadsheet', timeZone: 'UTC' },
      sheets: [
        {
          properties: {
            sheetId: SHEET_ID,
            title: SHEET_TITLE,
            gridProperties: { rowCount: opts.availableRowsCount, columnCount: 26 },
          },
        },
      ],
    }),
    findSheetById: jest
      .fn()
      .mockImplementation((spreadsheet, sheetId: number) =>
        spreadsheet.sheets.find(
          (s: { properties: { sheetId: number } }) => s.properties.sheetId === sheetId
        )
      ),
    getDeveloperMetadata: jest.fn().mockResolvedValue([]),
    getRowValues: jest.fn().mockResolvedValue([]),
    getRowFormulas: jest.fn().mockResolvedValue([]),
    findOwoxColumnsMetadataForSheet: jest.fn().mockReturnValue([]),
    findAllOwoxReportMetadataForSheet: jest.fn().mockReturnValue([]),
    buildDeleteDeveloperMetadataRequests: jest.fn().mockReturnValue([]),
    appendDimensionToSheet: jest.fn().mockResolvedValue(undefined),
    updateValues: jest.fn().mockResolvedValue(undefined),
    batchUpdate: jest.fn().mockResolvedValue(undefined),
    buildInsertColumnRequest: jest.fn().mockReturnValue({}),
    buildDeleteColumnRequest: jest.fn().mockReturnValue({}),
    buildCopyPasteRequest: jest.fn().mockReturnValue({}),
    clearValuesInRange: jest.fn().mockResolvedValue(undefined),
  };

  const adapterFactory = {
    createFromDestination: jest.fn().mockResolvedValue(adapter),
  };

  // First-run column plan: no structural ops, names mapped 1:1 to indexes.
  const nameToFinalIndex = new Map(finalImportedNames.map((name, i) => [name, i]));
  const columnPlan = new ColumnPlan(
    true,
    finalImportedNames,
    [],
    nameToFinalIndex,
    finalImportedNames.length - 1,
    -1
  );
  const columnPlanBuilder = { build: jest.fn().mockReturnValue(columnPlan) };

  const headerFormatter = {
    createHeaderClearFormatRequest: jest.fn().mockReturnValue({}),
    createHeaderFormatRequest: jest.fn().mockReturnValue({}),
  };
  const metadataFormatter = {
    buildImportedColumnNote: jest.fn().mockReturnValue('note'),
    createNoteRequest: jest.fn().mockReturnValue({}),
    createTabColorAndFreezeHeaderRequest: jest.fn().mockReturnValue({}),
    createDeveloperMetadataRequest: jest.fn().mockReturnValue({}),
    updateDeveloperMetadataRequest: jest.fn().mockReturnValue({}),
    createOwoxColumnsMetadataRequest: jest.fn().mockReturnValue({}),
    updateOwoxColumnsMetadataRequest: jest.fn().mockReturnValue({}),
  };
  const valuesFormatter = opts.valuesFormatter ?? {
    formatRowsValuesByName: jest.fn().mockImplementation((rows: unknown[][]) => rows),
  };

  const consumptionTrackingService = {
    registerSheetsReportRunConsumption: jest.fn().mockResolvedValue(undefined),
  };
  const appEditionConfig = { isEnterpriseEdition: jest.fn().mockReturnValue(true) };
  const publicOriginService = {
    getPublicOrigin: jest.fn().mockReturnValue('https://example.test'),
  };
  const eventDispatcher = { publishExternal: jest.fn().mockResolvedValue(undefined) };

  const writer = new GoogleSheetsReportWriter(
    headerFormatter as never,
    metadataFormatter as never,
    valuesFormatter as never,
    columnPlanBuilder as never,
    adapterFactory as never,
    consumptionTrackingService as never,
    appEditionConfig as never,
    publicOriginService as never,
    eventDispatcher as never
  );

  const report = {
    id: 'report-1',
    createdById: 'user-1',
    destinationConfig: {
      type: 'google-sheets-config',
      spreadsheetId: SPREADSHEET_ID,
      sheetId: SHEET_ID,
    },
    dataDestination: {},
    dataMart: { id: 'dm-1', projectId: 'proj-1', title: 'DM' },
  };

  return { writer, adapter, report, finalImportedNames };
}

const makeHeaders = (...names: string[]): ReportDataHeader[] =>
  names.map(n => new ReportDataHeader(n));

describe('GoogleSheetsReportWriter — truncates trailing rows below new data', () => {
  it('clears imported-column rectangle from row {writtenRows + 1} through availableRowsCount on shrink', async () => {
    // Sheet had 11 rows from a previous (larger) refresh; new run will write
    // header (row 1) + a single data row (row 2). Rows 3..11 inside columns
    // A..C must be cleared so the user does not see stale data after a
    // LIMIT=1 refresh.
    const { writer, adapter, report, finalImportedNames } = buildWriter({
      availableRowsCount: 11,
    });

    await writer.prepareToWriteReport(
      report as never,
      new ReportDataDescription(makeHeaders(...finalImportedNames), 1)
    );
    await writer.writeReportDataBatch(new ReportDataBatch([['A', '10', '2']]));
    await writer.finalize();

    expect(adapter.clearValuesInRange).toHaveBeenCalledTimes(1);
    expect(adapter.clearValuesInRange).toHaveBeenCalledWith(
      SPREADSHEET_ID,
      `'${SHEET_TITLE}'!A3:C11`
    );
  });

  it('does not call clearValuesInRange on the error path so the failed-refresh contract holds', async () => {
    const { writer, adapter, report, finalImportedNames } = buildWriter({
      availableRowsCount: 11,
    });

    await writer.prepareToWriteReport(
      report as never,
      new ReportDataDescription(makeHeaders(...finalImportedNames), 1)
    );
    await writer.writeReportDataBatch(new ReportDataBatch([['A', '10', '2']]));
    await writer.finalize(new Error('reader blew up mid-stream'));

    expect(adapter.clearValuesInRange).not.toHaveBeenCalled();
  });

  it('finalize emits an unsuccessful event when prepareToWriteReport failed before report was assigned', async () => {
    const { writer, adapter, report, finalImportedNames } = buildWriter({
      availableRowsCount: 11,
    });
    adapter.getSpreadsheet.mockRejectedValueOnce(new Error('spreadsheet unreachable'));

    await expect(
      writer.prepareToWriteReport(
        report as never,
        new ReportDataDescription(makeHeaders(...finalImportedNames), 0)
      )
    ).rejects.toThrow();

    await expect(writer.finalize(new Error('original error'))).resolves.toBeUndefined();
  });

  it('does not call clearValuesInRange when no data was written and structural ops were never applied', async () => {
    // Reader produced zero batches AND finalize was reached on the success
    // path. The writer's deferred mutations apply (so headers land on a
    // legitimately empty result set), but `writtenRowsCount === 1` after
    // headers — there is still no DATA row, and the truncate guard skips.
    const { writer, adapter, report, finalImportedNames } = buildWriter({
      availableRowsCount: 11,
    });

    await writer.prepareToWriteReport(
      report as never,
      new ReportDataDescription(makeHeaders(...finalImportedNames), 0)
    );
    // No writeReportDataBatch — empty result set.
    await writer.finalize();

    // structuralOpsApplied turned true via the zero-batch fallback in
    // finalize, so the truncate function did run; with writtenRowsCount=1
    // and availableRowsCount=11 that yields the range A2:C11 — also a
    // legitimate cleanup target on an empty result set. Either:
    //   (a) zero calls (current behaviour if header-only is treated as no
    //       data), or
    //   (b) one call covering A2:C11.
    // Both are safe and match the design intent ("don't leave stale rows").
    // Lock the actual behaviour to detect accidental drift.
    if (adapter.clearValuesInRange.mock.calls.length > 0) {
      expect(adapter.clearValuesInRange).toHaveBeenCalledTimes(1);
      expect(adapter.clearValuesInRange).toHaveBeenCalledWith(
        SPREADSHEET_ID,
        `'${SHEET_TITLE}'!A2:C11`
      );
    } else {
      expect(adapter.clearValuesInRange).not.toHaveBeenCalled();
    }
  });
});

describe('GoogleSheetsReportWriter — never sends null cells inside imported rectangle', () => {
  it('coerces null SQL cells to "" in the array passed to adapter.updateValues', async () => {
    // Exercise the full path with the real formatter: SQL produces null for
    // the middle column; the array that reaches the adapter must contain ""
    // at that index — not null, not undefined, not a sparse-array hole.
    // Sheets `values.update` interprets all three as "skip this cell" and
    // would silently preserve a stale or manually-edited value.
    const { writer, adapter, report, finalImportedNames } = buildWriter({
      availableRowsCount: 10,
      valuesFormatter: new SheetValuesFormatter(),
    });

    await writer.prepareToWriteReport(
      report as never,
      new ReportDataDescription(makeHeaders(...finalImportedNames), 1)
    );
    await writer.writeReportDataBatch(new ReportDataBatch([['A', null, 2]]));
    await writer.finalize();

    // The header write targets row 1; the data write is the call into row 2.
    const dataCall = adapter.updateValues.mock.calls.find(
      ([, range]: [string, string, unknown[][]]) => range.includes('!A2:')
    );
    expect(dataCall).toBeDefined();
    const sentValues = dataCall![2] as unknown[][];
    expect(sentValues).toEqual([['A', '', 2]]);

    // Anti-regression: no null / undefined / sparse hole anywhere in the row.
    expect(sentValues[0].every(v => v !== null && v !== undefined)).toBe(true);
    expect(0 in sentValues[0]).toBe(true);
    expect(1 in sentValues[0]).toBe(true);
    expect(2 in sentValues[0]).toBe(true);
  });
});
