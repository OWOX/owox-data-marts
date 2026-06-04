import { sheets_v4 } from 'googleapis';
import { ColumnPlan, PreviousImportedColumn } from '../../../dto/domain/column-plan.dto';
import { ReportDataBatch } from '../../../dto/domain/report-data-batch.dto';
import { ReportDataDescription } from '../../../dto/domain/report-data-description.dto';
import { ReportDataHeader } from '../../../dto/domain/report-data-header.dto';
import { GoogleSheetsReportWriter } from './google-sheets-report-writer';
import { ColumnPlanBuilder } from './column-plan-builder';

/**
 * Targeted unit spec for {@link GoogleSheetsReportWriter}'s pre-clear
 * behaviour. The writer pre-clears the imported rectangle as part of
 * `applyDeferredSheetMutations`, so subsequent batch writes operate on a
 * clean slate: cells SQL does not overwrite (whether because of NULL in
 * the payload or because the new dataset shrank) end up empty, never
 * holding stale data or manual user edits.
 *
 * The pre-clear is gated by the same deferred-mutations flag that gates
 * structural ops and headers — if the reader fails before producing any
 * batch, nothing happens to the sheet (failed-refresh contract from
 * PR #1191).
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
  getColumnFormats: jest.Mock;
  buildSetColumnFormatRequest: jest.Mock;
}

interface BuildOpts {
  /**
   * Total rows in the destination sheet at the start of the run. Drives the
   * `availableRowsCount` snapshot the writer reads from
   * `sheet.properties.gridProperties.rowCount`. Choose a value larger than
   * the new run so the pre-clear range is non-trivial.
   */
  availableRowsCount: number;
  /**
   * Final imported column names returned by the mocked column plan. Drives
   * the right edge of the imported rectangle the writer pre-clears.
   */
  finalImportedNames?: string[];
  /**
   * Canonical names occupying the imported row-1 cells before the write.
   * Drives the user-format capture (keyed by name). Defaults to `[]` (first
   * run — nothing to capture).
   */
  currentImportedNames?: string[];
  /**
   * Cell formats `adapter.getColumnFormats` resolves to, positionally aligned
   * with {@link currentImportedNames}. `undefined` slot == an unformatted
   * ("Automatic") column. Defaults to all-`undefined`.
   */
  columnFormats?: (sheets_v4.Schema$CellFormat | undefined)[];
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
    getColumnFormats: jest
      .fn()
      .mockResolvedValue(
        opts.columnFormats ?? (opts.currentImportedNames ?? []).map(() => undefined)
      ),
    // Echo a tagged marker so tests can assert which (column, format) pairs
    // were scheduled for restore in the finalize batch.
    buildSetColumnFormatRequest: jest
      .fn()
      .mockImplementation(
        (
          _sheetId: number,
          columnIndex: number,
          startRowIndex: number,
          endRowIndex: number,
          format: sheets_v4.Schema$CellFormat
        ) => ({
          __restoreFormat: { columnIndex, startRowIndex, endRowIndex, format },
        })
      ),
  };

  const adapterFactory = {
    createFromDestination: jest.fn().mockResolvedValue(adapter),
  };

  // Column plan: no structural ops, names mapped 1:1 to indexes. Defaults to
  // a first-run plan (no imported columns yet) unless the test supplies
  // `currentImportedNames` to exercise the capture/restore path.
  const currentImportedNames = opts.currentImportedNames ?? [];
  const isFirstRun = currentImportedNames.length === 0;
  const nameToFinalIndex = new Map(finalImportedNames.map((name, i) => [name, i]));
  const columnPlan = new ColumnPlan(
    isFirstRun,
    finalImportedNames,
    [],
    nameToFinalIndex,
    finalImportedNames.length - 1,
    isFirstRun ? -1 : currentImportedNames.length - 1,
    currentImportedNames
  );
  const columnPlanBuilder = { build: jest.fn().mockReturnValue(columnPlan) };

  const headerFormatter = {
    createHeaderClearFormatRequest: jest.fn().mockReturnValue({}),
    createHeaderFormatRequest: jest.fn().mockReturnValue({}),
  };
  const metadataFormatter = {
    buildImportedColumnNote: jest.fn().mockReturnValue('note'),
    buildImportedColumnMarker: jest.fn().mockReturnValue('marker'),
    createNoteRequest: jest.fn().mockReturnValue({}),
    createTabColorAndFreezeHeaderRequest: jest.fn().mockReturnValue({}),
    createDeveloperMetadataRequest: jest.fn().mockReturnValue({}),
    updateDeveloperMetadataRequest: jest.fn().mockReturnValue({}),
    createOwoxColumnsMetadataRequest: jest.fn().mockReturnValue({}),
    updateOwoxColumnsMetadataRequest: jest.fn().mockReturnValue({}),
  };
  const valuesFormatter = {
    formatRowsValuesByName: jest.fn().mockImplementation((rows: unknown[][]) => rows),
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

  return { writer, adapter, report, finalImportedNames, metadataFormatter };
}

const makeHeaders = (...names: string[]): ReportDataHeader[] =>
  names.map(n => new ReportDataHeader(n));

describe('GoogleSheetsReportWriter — pre-clears imported rectangle before writing', () => {
  it('returns Sheets consumption metadata without registering consumption directly', async () => {
    const { writer, report, finalImportedNames } = buildWriter({
      availableRowsCount: 11,
    });

    await writer.prepareToWriteReport(
      report as never,
      new ReportDataDescription(makeHeaders(...finalImportedNames), 1)
    );
    await writer.writeReportDataBatch(new ReportDataBatch([['A', '10', '2']]));

    const result = await writer.finalize();

    expect(result).toEqual({
      consumption: {
        googleSheets: {
          googleSheetsDocumentTitle: 'Test Spreadsheet',
          googleSheetsListTitle: SHEET_TITLE,
        },
      },
    });
  });

  it('pre-clears A2..lastImportedColA1:availableRows on the first batch', async () => {
    // Sheet had 11 rows from a previous (larger) refresh; this run will write
    // header (row 1) + a single data row (row 2). The pre-clear must wipe
    // rows 2..11 inside columns A..C so neither stale rows from the previous
    // run nor manual user edits survive in the imported rectangle.
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
      `'${SHEET_TITLE}'!A2:C11`
    );
  });

  it('does not pre-clear again on subsequent batches in the same run', async () => {
    const { writer, adapter, report, finalImportedNames } = buildWriter({
      availableRowsCount: 11,
    });

    await writer.prepareToWriteReport(
      report as never,
      new ReportDataDescription(makeHeaders(...finalImportedNames), 2)
    );
    await writer.writeReportDataBatch(new ReportDataBatch([['A', '10', '2']]));
    await writer.writeReportDataBatch(new ReportDataBatch([['B', '20', '5']]));
    await writer.finalize();

    // Only the first batch triggers `applyDeferredSheetMutations`, which is
    // the gate that issues the single pre-clear call.
    expect(adapter.clearValuesInRange).toHaveBeenCalledTimes(1);
  });

  it('does not pre-clear when reader fails before any batch is sent', async () => {
    const { writer, adapter, report, finalImportedNames } = buildWriter({
      availableRowsCount: 11,
    });

    await writer.prepareToWriteReport(
      report as never,
      new ReportDataDescription(makeHeaders(...finalImportedNames), 1)
    );
    // No writeReportDataBatch — reader failed before producing data.
    await writer.finalize(new Error('reader failed before any batch'));

    // Failed-refresh contract: sheet is byte-for-byte unchanged. Pre-clear
    // is gated behind the same deferred-mutations flag as structural ops,
    // so neither runs on this path.
    expect(adapter.clearValuesInRange).not.toHaveBeenCalled();
    expect(adapter.updateValues).not.toHaveBeenCalled();
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

  it('pre-clears in the zero-batch fallback so empty result sets wipe stale data', async () => {
    // Reader produced zero batches AND finalize was reached on the success
    // path (e.g. SQL returned 0 rows). The deferred-mutations fallback in
    // finalize applies headers + pre-clear so the user sees fresh headers
    // and an empty data area, not headers above stale data from the
    // previous refresh.
    const { writer, adapter, report, finalImportedNames } = buildWriter({
      availableRowsCount: 11,
    });

    await writer.prepareToWriteReport(
      report as never,
      new ReportDataDescription(makeHeaders(...finalImportedNames), 0)
    );
    // No writeReportDataBatch — empty result set.
    await writer.finalize();

    expect(adapter.clearValuesInRange).toHaveBeenCalledTimes(1);
    expect(adapter.clearValuesInRange).toHaveBeenCalledWith(
      SPREADSHEET_ID,
      `'${SHEET_TITLE}'!A2:C11`
    );
  });
});

describe('GoogleSheetsReportWriter — pre-clear range invariants', () => {
  it('pre-clear starts from row 2 so freshly-written headers (row 1) are preserved', async () => {
    const { writer, adapter, report, finalImportedNames } = buildWriter({
      availableRowsCount: 50,
    });

    await writer.prepareToWriteReport(
      report as never,
      new ReportDataDescription(makeHeaders(...finalImportedNames), 1)
    );
    await writer.writeReportDataBatch(new ReportDataBatch([['A', '10', '2']]));
    await writer.finalize();

    expect(adapter.clearValuesInRange).toHaveBeenCalledTimes(1);
    const [, range] = adapter.clearValuesInRange.mock.calls[0];
    // Range starts at A2, never at A1 — row 1 holds the headers we just wrote.
    expect(range).toMatch(/!A2:/);
    expect(range).not.toMatch(/!A1:/);
  });

  it('pre-clear ends at the last imported column, never reaching user content further right', async () => {
    // 3 imported columns (A, B, C). A user can put formulas / lookup tables /
    // pivot anchors in columns D..Z; pre-clear must NOT include them.
    const { writer, adapter, report, finalImportedNames } = buildWriter({
      availableRowsCount: 11,
    });

    await writer.prepareToWriteReport(
      report as never,
      new ReportDataDescription(makeHeaders(...finalImportedNames), 1)
    );
    await writer.writeReportDataBatch(new ReportDataBatch([['A', '10', '2']]));
    await writer.finalize();

    const [, range] = adapter.clearValuesInRange.mock.calls[0];
    expect(range).toBe(`'${SHEET_TITLE}'!A2:C11`);
    // Defensive: explicit guard against accidentally extending the range
    // to columns past C (D, E, ..., the whole imported-rectangle-plus-1 zone).
    expect(range).not.toMatch(/:D\d/);
  });

  it('builds the correct A1 range when imported columns cross the Z→AA boundary', async () => {
    // 27 columns: A..Z (26) + AA. The pre-clear range MUST use "AA", not
    // some malformed string that would either truncate to a smaller range
    // (data loss) or expand the wrong way.
    const wideNames = Array.from({ length: 27 }, (_, i) => `col_${i + 1}`);
    const { writer, adapter, report, finalImportedNames } = buildWriter({
      availableRowsCount: 20,
      finalImportedNames: wideNames,
    });
    const dataRow = Array.from({ length: 27 }, (_, i) => `v${i}`);

    await writer.prepareToWriteReport(
      report as never,
      new ReportDataDescription(makeHeaders(...finalImportedNames), 1)
    );
    await writer.writeReportDataBatch(new ReportDataBatch([dataRow]));
    await writer.finalize();

    expect(adapter.clearValuesInRange).toHaveBeenCalledTimes(1);
    const [, range] = adapter.clearValuesInRange.mock.calls[0];
    expect(range).toBe(`'${SHEET_TITLE}'!A2:AA20`);
  });

  it('invokes pre-clear BEFORE the data write so subsequent writes always land on cleared cells', async () => {
    const { writer, adapter, report, finalImportedNames } = buildWriter({
      availableRowsCount: 11,
    });

    await writer.prepareToWriteReport(
      report as never,
      new ReportDataDescription(makeHeaders(...finalImportedNames), 1)
    );
    await writer.writeReportDataBatch(new ReportDataBatch([['A', '10', '2']]));

    // The data write targets a range starting with !A2: (row 2).
    // writeHeaders targets !A1:C1 (row 1) — exclude it from the check.
    const dataWriteIdx = adapter.updateValues.mock.calls.findIndex(([, range]: [string, string]) =>
      range.includes('!A2:')
    );
    expect(dataWriteIdx).toBeGreaterThanOrEqual(0);

    // Both calls happened (asserted via mock.calls indexes above), so the
    // corresponding invocation-order entries are guaranteed defined.
    const clearOrder = adapter.clearValuesInRange.mock.invocationCallOrder[0]!;
    const dataWriteOrder = adapter.updateValues.mock.invocationCallOrder[dataWriteIdx]!;
    expect(clearOrder).toBeLessThan(dataWriteOrder);
  });

  it('passes nullish cells through to the adapter unchanged — pre-clear is the only mechanism that clears', async () => {
    // Architectural decision lock: the writer no longer normalizes nullish
    // in the payload. NULL from SQL reaches the adapter as `null`; the cell
    // ends up empty because pre-clear already wiped it and `values.update`
    // with null in the payload leaves the (now empty) cell alone.
    const { writer, adapter, report, finalImportedNames } = buildWriter({
      availableRowsCount: 11,
    });

    await writer.prepareToWriteReport(
      report as never,
      new ReportDataDescription(makeHeaders(...finalImportedNames), 1)
    );
    await writer.writeReportDataBatch(new ReportDataBatch([['A', null, 2]]));

    const dataCall = adapter.updateValues.mock.calls.find(
      ([, range]: [string, string, unknown[][]]) => range.includes('!A2:')
    );
    expect(dataCall).toBeDefined();
    const sentValues = dataCall![2] as unknown[][];
    expect(sentValues).toEqual([['A', null, 2]]);
  });

  it('aborts the data batch and surfaces the error when pre-clear fails', async () => {
    const { writer, adapter, report, finalImportedNames } = buildWriter({
      availableRowsCount: 11,
    });
    adapter.clearValuesInRange.mockRejectedValueOnce(new Error('Sheets clear API blew up'));

    await writer.prepareToWriteReport(
      report as never,
      new ReportDataDescription(makeHeaders(...finalImportedNames), 1)
    );
    await expect(
      writer.writeReportDataBatch(new ReportDataBatch([['A', '10', '2']]))
    ).rejects.toThrow();

    // The data row write (range starts with !A2:) MUST NOT have happened —
    // pre-clear failure aborts applyDeferredSheetMutations before the batch
    // payload reaches the adapter. writeHeaders may have already run
    // (it sits before pre-clear in the deferred sequence), which is
    // acceptable: the run will be retried, and the next pre-clear will
    // overwrite row 1 again via the same flow.
    const dataWrites = adapter.updateValues.mock.calls.filter(([, range]: [string, string]) =>
      range.includes('!A2:')
    );
    expect(dataWrites).toHaveLength(0);
  });
});

describe('GoogleSheetsReportWriter — preserves user column formats across refresh', () => {
  // Full userEnteredFormat shapes — number format AND non-number formatting.
  const CURRENCY: sheets_v4.Schema$CellFormat = {
    numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0.00' },
  };
  const DATE: sheets_v4.Schema$CellFormat = {
    numberFormat: { type: 'DATE', pattern: 'dd.MM.yyyy' },
  };
  // A non-number format: background + bold text + right alignment, no numberFormat.
  const STYLED: sheets_v4.Schema$CellFormat = {
    backgroundColor: { red: 1, green: 0.9, blue: 0.6 },
    textFormat: { bold: true, foregroundColor: { red: 0.2, green: 0.2, blue: 0.2 } },
    horizontalAlignment: 'RIGHT',
  };

  /** Collects the restore-format markers scheduled into the finalize batch. */
  function restoreMarkers(adapter: AdapterMock) {
    return adapter.batchUpdate.mock.calls
      .flatMap(
        ([, requests]: [string, unknown[]]) => requests as Array<{ __restoreFormat?: unknown }>
      )
      .map(r => r.__restoreFormat)
      .filter(Boolean) as Array<{
      columnIndex: number;
      startRowIndex: number;
      endRowIndex: number;
      format: sheets_v4.Schema$CellFormat;
    }>;
  }

  it('captures row-2 formats before the write and re-applies them over the written data rows', async () => {
    // Subsequent run: user has applied a DATE format to col A (country... say a
    // date column) and a CURRENCY format to col C (cost). Col B is unformatted.
    const { writer, adapter, report, finalImportedNames } = buildWriter({
      availableRowsCount: 11,
      currentImportedNames: ['country', 'clicks', 'cost'],
      columnFormats: [DATE, undefined, CURRENCY],
    });

    await writer.prepareToWriteReport(
      report as never,
      new ReportDataDescription(makeHeaders(...finalImportedNames), 2)
    );
    // Capture samples a bounded row window starting at row 2 across the
    // imported width, before any write — and targets the destination tab by
    // sheetId (not by position). rowTo = min(availableRowsCount, 2+100-1) = 11.
    expect(adapter.getColumnFormats).toHaveBeenCalledWith(
      SPREADSHEET_ID,
      SHEET_ID,
      SHEET_TITLE,
      2,
      11,
      1,
      3
    );

    await writer.writeReportDataBatch(new ReportDataBatch([['A', '10', '2']]));
    await writer.writeReportDataBatch(new ReportDataBatch([['B', '20', '5']]));
    await writer.finalize();

    // Two formatted columns → two restore requests, each over rows 2..3
    // (writtenRowsCount = 1 header-marker + 2 data rows = 3 → endRowIndex 3).
    const markers = restoreMarkers(adapter);
    expect(markers).toEqual(
      expect.arrayContaining([
        { columnIndex: 0, startRowIndex: 1, endRowIndex: 3, format: DATE },
        { columnIndex: 2, startRowIndex: 1, endRowIndex: 3, format: CURRENCY },
      ])
    );
    // The unformatted column is never restored — we must not impose a format.
    expect(markers.find(m => m.columnIndex === 1)).toBeUndefined();
  });

  it('preserves non-number formatting (background, text color, alignment), not just numberFormat', async () => {
    // The whole userEnteredFormat is captured and restored, so a column the
    // user styled WITHOUT a number format still survives a refresh.
    const { writer, adapter, report, finalImportedNames } = buildWriter({
      availableRowsCount: 11,
      currentImportedNames: ['country', 'clicks', 'cost'],
      columnFormats: [STYLED, undefined, undefined],
    });

    await writer.prepareToWriteReport(
      report as never,
      new ReportDataDescription(makeHeaders(...finalImportedNames), 1)
    );
    await writer.writeReportDataBatch(new ReportDataBatch([['A', '10', '2']]));
    await writer.finalize();

    const markers = restoreMarkers(adapter);
    expect(markers).toEqual([{ columnIndex: 0, startRowIndex: 1, endRowIndex: 2, format: STYLED }]);
  });

  it('restores the format AFTER the data write so it wins over USER_ENTERED inference', async () => {
    const { writer, adapter, report, finalImportedNames } = buildWriter({
      availableRowsCount: 11,
      currentImportedNames: ['country', 'clicks', 'cost'],
      columnFormats: [undefined, undefined, CURRENCY],
    });

    await writer.prepareToWriteReport(
      report as never,
      new ReportDataDescription(makeHeaders(...finalImportedNames), 1)
    );
    await writer.writeReportDataBatch(new ReportDataBatch([['A', '10', '2']]));
    await writer.finalize();

    const dataWriteIdx = adapter.updateValues.mock.calls.findIndex(([, range]: [string, string]) =>
      range.includes('!A2:')
    );
    const dataWriteOrder = adapter.updateValues.mock.invocationCallOrder[dataWriteIdx]!;
    const restoreBatchOrder = adapter.buildSetColumnFormatRequest.mock.invocationCallOrder[0]!;
    // The restore request is built as part of the finalize batch, which is
    // issued strictly after the data values were written.
    expect(restoreBatchOrder).toBeGreaterThan(dataWriteOrder);
  });

  it('does not capture or restore anything on the first run', async () => {
    const { writer, adapter, report, finalImportedNames } = buildWriter({
      availableRowsCount: 11,
      // currentImportedNames defaults to [] → first run.
    });

    await writer.prepareToWriteReport(
      report as never,
      new ReportDataDescription(makeHeaders(...finalImportedNames), 1)
    );
    await writer.writeReportDataBatch(new ReportDataBatch([['A', '10', '2']]));
    await writer.finalize();

    expect(adapter.getColumnFormats).not.toHaveBeenCalled();
    expect(adapter.buildSetColumnFormatRequest).not.toHaveBeenCalled();
  });

  it('does not restore formats when the refresh fails before any data is written', async () => {
    const { writer, adapter, report, finalImportedNames } = buildWriter({
      availableRowsCount: 11,
      currentImportedNames: ['country', 'clicks', 'cost'],
      columnFormats: [DATE, undefined, CURRENCY],
    });

    await writer.prepareToWriteReport(
      report as never,
      new ReportDataDescription(makeHeaders(...finalImportedNames), 1)
    );
    // Reader failed before producing any batch.
    await writer.finalize(new Error('reader failed'));

    expect(adapter.buildSetColumnFormatRequest).not.toHaveBeenCalled();
  });

  it('skips restoring a captured format for a column dropped from the export', async () => {
    // User had a CURRENCY format on `clicks`, but the new export omits it
    // (finalImportedNames lacks `clicks`). The captured format must not be
    // re-applied to whatever column now sits at that index.
    const { writer, adapter, report } = buildWriter({
      availableRowsCount: 11,
      finalImportedNames: ['country', 'cost'],
      currentImportedNames: ['country', 'clicks', 'cost'],
      columnFormats: [undefined, CURRENCY, undefined],
    });

    await writer.prepareToWriteReport(
      report as never,
      new ReportDataDescription(makeHeaders('country', 'cost'), 1)
    );
    await writer.writeReportDataBatch(new ReportDataBatch([['A', '2']]));
    await writer.finalize();

    expect(restoreMarkers(adapter)).toEqual([]);
  });

  it('does not fail the report run when capturing formats throws (best-effort)', async () => {
    // Capturing formats is cosmetic: a transient spreadsheets.get failure must
    // NOT abort the export. The run proceeds and simply restores no formats.
    const { writer, adapter, report, finalImportedNames } = buildWriter({
      availableRowsCount: 11,
      currentImportedNames: ['country', 'clicks', 'cost'],
      columnFormats: [DATE, undefined, CURRENCY],
    });
    adapter.getColumnFormats.mockRejectedValueOnce(new Error('Sheets get API blew up'));

    // prepareToWriteReport must NOT reject despite the capture failure — a
    // plain await fails the test if it rejects. We intentionally do not assert
    // the resolved value: the best-effort contract is about "does not throw",
    // and finalize's resolved value is not part of it.
    await writer.prepareToWriteReport(
      report as never,
      new ReportDataDescription(makeHeaders(...finalImportedNames), 1)
    );

    // The data write and finalize proceed normally (must not reject).
    await writer.writeReportDataBatch(new ReportDataBatch([['A', '10', '2']]));
    await writer.finalize();

    // ...but nothing is restored, since the capture never completed.
    expect(restoreMarkers(adapter)).toEqual([]);
    // Data was still written — the export did its job.
    const dataWrites = adapter.updateValues.mock.calls.filter(([, range]: [string, string]) =>
      range.includes('!A2:')
    );
    expect(dataWrites.length).toBeGreaterThan(0);
  });
});

describe('GoogleSheetsReportWriter — per-column header notes', () => {
  it('writes the full ODM note only on the first column and the short marker on the rest', async () => {
    const { writer, report, finalImportedNames, metadataFormatter } = buildWriter({
      availableRowsCount: 11,
    });

    await writer.prepareToWriteReport(
      report as never,
      new ReportDataDescription(makeHeaders(...finalImportedNames), 1)
    );
    await writer.writeReportDataBatch(new ReportDataBatch([['A', '10', '2']]));
    await writer.finalize();

    // Three imported columns → exactly one full note (A1) + two short markers.
    expect(metadataFormatter.buildImportedColumnNote).toHaveBeenCalledTimes(1);
    expect(metadataFormatter.buildImportedColumnMarker).toHaveBeenCalledTimes(
      finalImportedNames.length - 1
    );
    // The full note belongs to the first column's description ('country').
    expect(metadataFormatter.buildImportedColumnNote).toHaveBeenCalledWith(
      undefined,
      'DM',
      expect.any(String),
      expect.any(String),
      expect.any(Boolean)
    );
  });
});

/**
 * Structural-ops harness that *simulates the destination grid* so we can assert
 * the real Sheets-API contract: an `insertDimension { inheritFromBefore: false }`
 * request is rejected when `startIndex >= gridSize`.
 *
 * Unlike {@link buildWriter} (which mocks the column plan and treats request
 * builders as opaque), this harness:
 *   - builds a *real* {@link ColumnPlan} via {@link ColumnPlanBuilder} from
 *     previous/desired column lists, so ops + indices are exactly what
 *     production would produce;
 *   - has `appendDimensionToSheet` / `batchUpdate` mutate an in-memory column
 *     array, with `insertDimension` throwing the same "startIndex must be less
 *     than the grid size" error the live API throws — so a test that triggers
 *     the original bug fails loudly here too.
 *
 * The sheet's `columnCount` is the labeled grid width (imported + user cols),
 * i.e. no trailing empty columns — which is the only configuration in which the
 * bug can occur (`availableColumnsCount === prevWidth`).
 */
function buildStructuralWriter(opts: {
  previousImported: string[];
  desired: string[];
  userColsRight?: string[];
  availableRowsCount?: number;
}) {
  const userColsRight = opts.userColsRight ?? [];
  const availableRowsCount = opts.availableRowsCount ?? 100;

  // In-memory grid: one entry per column. Survivors keep their name, inserts
  // become 'NEW', a pre-allocated spare becomes 'SENT', user columns keep their
  // given label. We read this back after the run to assert the final layout.
  const grid: string[] = [...opts.previousImported, ...userColsRight];
  const initialColumnCount = grid.length;

  const applyRequestToGrid = (req: {
    insertDimension?: {
      range?: { dimension?: string; startIndex?: number; endIndex?: number };
      inheritFromBefore?: boolean;
    };
    deleteDimension?: { range?: { dimension?: string; startIndex?: number; endIndex?: number } };
  }) => {
    if (req?.insertDimension?.range?.dimension === 'COLUMNS') {
      const { startIndex = 0, endIndex } = req.insertDimension.range;
      const count = (endIndex ?? startIndex + 1) - startIndex;
      if (req.insertDimension.inheritFromBefore === false && startIndex >= grid.length) {
        // Mirror the live Sheets API rejection that motivated the sentinel fix.
        throw new Error(
          `Invalid requests.insertDimension: range.startIndex (${startIndex}) must be less ` +
            `than the grid size (${grid.length}) if inheritFromBefore is false`
        );
      }
      grid.splice(startIndex, 0, ...Array.from({ length: count }, () => 'NEW'));
    } else if (req?.deleteDimension?.range?.dimension === 'COLUMNS') {
      const { startIndex = 0, endIndex } = req.deleteDimension.range;
      const count = (endIndex ?? startIndex + 1) - startIndex;
      grid.splice(startIndex, count);
    }
  };

  const adapter = {
    getSpreadsheet: jest.fn().mockResolvedValue({
      properties: { title: 'Test Spreadsheet', timeZone: 'UTC' },
      sheets: [
        {
          properties: {
            sheetId: SHEET_ID,
            title: SHEET_TITLE,
            gridProperties: { rowCount: availableRowsCount, columnCount: initialColumnCount },
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
    appendDimensionToSheet: jest
      .fn()
      .mockImplementation(
        (_spreadsheetId: string, _sheetId: number, size: number, dimension: string) => {
          if (dimension === 'COLUMNS') {
            for (let i = 0; i < size; i++) {
              grid.push('SENT');
            }
          }
          return Promise.resolve();
        }
      ),
    updateValues: jest
      .fn()
      .mockImplementation((_spreadsheetId: string, range: string, values: unknown[][]) => {
        // Header write (row 1) relabels the imported columns with their final
        // names — overwriting the 'NEW' placeholders inserts produced — so the
        // post-run grid reads as the user would see it.
        if (/!A1:/.test(range) && Array.isArray(values?.[0])) {
          values[0].forEach((v, i) => {
            if (i < grid.length) {
              grid[i] = String(v);
            }
          });
        }
        return Promise.resolve();
      }),
    batchUpdate: jest
      .fn()
      .mockImplementation(
        (_spreadsheetId: string, requests: Parameters<typeof applyRequestToGrid>[0][]) => {
          requests.forEach(applyRequestToGrid);
          return Promise.resolve();
        }
      ),
    buildInsertColumnRequest: jest.fn((sheetId: number, atColIndex: number) => ({
      insertDimension: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: atColIndex, endIndex: atColIndex + 1 },
        inheritFromBefore: false,
      },
    })),
    buildDeleteColumnRequest: jest.fn((sheetId: number, atColIndex: number) => ({
      deleteDimension: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: atColIndex, endIndex: atColIndex + 1 },
      },
    })),
    buildCopyPasteRequest: jest.fn().mockReturnValue({}),
    clearValuesInRange: jest.fn().mockResolvedValue(undefined),
    getColumnFormats: jest.fn().mockResolvedValue(opts.previousImported.map(() => undefined)),
    buildSetColumnFormatRequest: jest.fn().mockReturnValue({}),
  };

  const adapterFactory = { createFromDestination: jest.fn().mockResolvedValue(adapter) };

  // Real plan: indices and op ordering exactly as production computes them.
  const existingHeaders = [...opts.previousImported, ...userColsRight];
  const previousOwoxColumns = opts.previousImported.map(n => new PreviousImportedColumn(n));
  const desiredHeaders = opts.desired.map(n => new ReportDataHeader(n));
  const columnPlan = new ColumnPlanBuilder().build(
    existingHeaders,
    previousOwoxColumns,
    desiredHeaders
  );
  const columnPlanBuilder = { build: jest.fn().mockReturnValue(columnPlan) };

  const headerFormatter = {
    createHeaderClearFormatRequest: jest.fn().mockReturnValue({}),
    createHeaderFormatRequest: jest.fn().mockReturnValue({}),
  };
  const metadataFormatter = {
    buildImportedColumnNote: jest.fn().mockReturnValue('note'),
    buildImportedColumnMarker: jest.fn().mockReturnValue('marker'),
    createNoteRequest: jest.fn().mockReturnValue({}),
    createTabColorAndFreezeHeaderRequest: jest.fn().mockReturnValue({}),
    createDeveloperMetadataRequest: jest.fn().mockReturnValue({}),
    updateDeveloperMetadataRequest: jest.fn().mockReturnValue({}),
    createOwoxColumnsMetadataRequest: jest.fn().mockReturnValue({}),
    updateOwoxColumnsMetadataRequest: jest.fn().mockReturnValue({}),
  };
  const valuesFormatter = {
    formatRowsValuesByName: jest.fn().mockImplementation((rows: unknown[][]) => rows),
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

  /** The structural batch is the (single) one carrying insert/delete dimension ops. */
  const structuralBatch = (): unknown[] | undefined => {
    const call = adapter.batchUpdate.mock.calls.find(([, reqs]: [string, Array<unknown>]) =>
      reqs.some(
        (r: { insertDimension?: unknown; deleteDimension?: unknown }) =>
          r.insertDimension || r.deleteDimension
      )
    );
    return call?.[1];
  };

  /** Run the full happy-path refresh: prepare → one data batch → finalize. */
  const runRefresh = async () => {
    await writer.prepareToWriteReport(
      report as never,
      new ReportDataDescription(desiredHeaders, 1)
    );
    await writer.writeReportDataBatch(new ReportDataBatch([opts.desired.map((_, i) => `v${i}`)]));
    return writer.finalize();
  };

  return { writer, adapter, report, columnPlan, grid, structuralBatch, runRefresh };
}

describe('GoogleSheetsReportWriter — insertDimension grid-size guard (sentinel)', () => {
  it('original bug scenario: prevWidth=3, prevAvail=3, deletes=2, inserts=1 — refresh succeeds, grid == finalCount', async () => {
    // Imported A,B,C fill the whole grid (no user columns). The new schema
    // keeps A, drops B & C, and adds X. On `main` the two deletes shrink the
    // grid to 1, and the single insert at index 1 (== gridSize) is rejected.
    const h = buildStructuralWriter({
      previousImported: ['a', 'b', 'c'],
      desired: ['a', 'x'],
    });

    // finalImportedNames = [a, x]; deletes c@2, b@1; insert @1.
    expect(h.columnPlan.finalImportedNames).toEqual(['a', 'x']);

    await expect(h.runRefresh()).resolves.toBeDefined();

    // Final grid is exactly the imported width — sentinel cleaned up.
    expect(h.grid).toEqual(['a', 'x']);

    // Exactly one spare column was appended (size 1), and the structural batch
    // carried plan.ops + a single cleanup delete.
    const colAppends = h.adapter.appendDimensionToSheet.mock.calls.filter(
      ([, , , dim]: [string, number, number, string]) => dim === 'COLUMNS'
    );
    expect(colAppends).toEqual([[SPREADSHEET_ID, SHEET_ID, 1, 'COLUMNS']]);
    expect(h.structuralBatch()).toHaveLength(h.columnPlan.ops.length + 1);
  });

  it('survivors.length === 0: prevWidth=5, prevAvail=5, deletes=5, inserts=1 — refresh succeeds, grid == finalCount (1)', async () => {
    // All five imported columns are dropped and one new column added. After the
    // five deletes only the sentinel remains, so the insert at index 0 fits.
    const h = buildStructuralWriter({
      previousImported: ['a', 'b', 'c', 'd', 'e'],
      desired: ['x'],
    });

    expect(h.columnPlan.finalImportedNames).toEqual(['x']);

    await expect(h.runRefresh()).resolves.toBeDefined();

    expect(h.grid).toEqual(['x']);
    const colAppends = h.adapter.appendDimensionToSheet.mock.calls.filter(
      ([, , , dim]: [string, number, number, string]) => dim === 'COLUMNS'
    );
    expect(colAppends).toEqual([[SPREADSHEET_ID, SHEET_ID, 1, 'COLUMNS']]);
  });

  it('user column to the right (prevWidth=3, prevAvail=4, deletes=1, inserts=2) — U preserved, no sentinel allocated', async () => {
    // The bug cannot occur here: the grid after the delete is
    // survivors.length(2) + userCol(1) = 3, leaving room for the inserts. The
    // fix must NOT engage — no spare column, no cleanup delete — and the user
    // column U must survive untouched at the right edge.
    const h = buildStructuralWriter({
      previousImported: ['a', 'b', 'c'],
      userColsRight: ['U'],
      desired: ['a', 'b', 'x', 'y'],
    });

    expect(h.columnPlan.finalImportedNames).toEqual(['a', 'b', 'x', 'y']);

    await expect(h.runRefresh()).resolves.toBeDefined();

    // Imported width grows to 4; U stays as the last (5th) column.
    expect(h.grid).toEqual(['a', 'b', 'x', 'y', 'U']);

    // No spare column was pre-allocated, and the structural batch carried only
    // the plan ops — byte-for-byte the `main` behaviour.
    const colAppends = h.adapter.appendDimensionToSheet.mock.calls.filter(
      ([, , , dim]: [string, number, number, string]) => dim === 'COLUMNS'
    );
    expect(colAppends).toEqual([]);
    expect(h.structuralBatch()).toHaveLength(h.columnPlan.ops.length);
  });

  it('invariant regression: multiple user columns right of the imported range are left untouched across a delete+insert refresh', async () => {
    // Two user columns (a formula column and a static one) sit to the right of
    // the imported range. A refresh that both deletes and inserts imported
    // columns must leave them in place — the docstring invariant on ColumnPlan.
    const h = buildStructuralWriter({
      previousImported: ['a', 'b', 'c'],
      userColsRight: ['=A2*2', 'notes'],
      desired: ['a', 'x'],
    });

    await expect(h.runRefresh()).resolves.toBeDefined();

    // Imported collapses to [a, x]; both user columns remain at the right edge
    // in their original order.
    expect(h.grid).toEqual(['a', 'x', '=A2*2', 'notes']);
    const colAppends = h.adapter.appendDimensionToSheet.mock.calls.filter(
      ([, , , dim]: [string, number, number, string]) => dim === 'COLUMNS'
    );
    expect(colAppends).toEqual([]);
  });

  it('proves the harness reproduces the bug: without the sentinel the insert is rejected', async () => {
    // Sanity check on the simulator itself — drive the exact op sequence the
    // unfixed code would issue (delete, delete, insert) against the bug grid
    // and confirm it throws the grid-size error. Guards against a false-green
    // simulator that would let a regression slip through.
    const grid = ['a', 'b', 'c'];
    const apply = (req: {
      insertDimension?: {
        range?: { dimension?: string; startIndex?: number; endIndex?: number };
        inheritFromBefore?: boolean;
      };
      deleteDimension?: { range?: { dimension?: string; startIndex?: number; endIndex?: number } };
    }) => {
      if (req.deleteDimension?.range?.dimension === 'COLUMNS') {
        grid.splice(req.deleteDimension.range.startIndex ?? 0, 1);
      } else if (req.insertDimension?.range?.dimension === 'COLUMNS') {
        const s = req.insertDimension.range?.startIndex ?? 0;
        if (req.insertDimension.inheritFromBefore === false && s >= grid.length) {
          throw new Error('range.startIndex must be less than the grid size');
        }
        grid.splice(s, 0, 'NEW');
      }
    };

    expect(() => {
      apply({ deleteDimension: { range: { dimension: 'COLUMNS', startIndex: 2 } } });
      apply({ deleteDimension: { range: { dimension: 'COLUMNS', startIndex: 1 } } });
      apply({
        insertDimension: {
          range: { dimension: 'COLUMNS', startIndex: 1 },
          inheritFromBefore: false,
        },
      });
    }).toThrow(/grid size/);
  });

  it('insert-heavy, no user columns (prevWidth=3, avail=3, deletes=1, inserts=2): leaves no orphan trailing column — grid == finalImportedNames', async () => {
    // The imported range fills the whole grid and the new schema is net-growing
    // (drops c, adds x & y). The `insertDimension` ops create their own columns,
    // so pre-allocating the grid to `finalImportedNames.length` up front
    // double-counts the inserts: every refresh would leave `inserts - deletes`
    // empty orphan columns to the right of the imported rectangle, silently
    // violating the "ODM owns the imported rectangle" contract and corrupting
    // the slack / user-column detection used on the next refresh.
    const h = buildStructuralWriter({
      previousImported: ['a', 'b', 'c'],
      desired: ['a', 'c', 'x', 'y'],
    });

    expect(h.columnPlan.finalImportedNames).toEqual(['a', 'c', 'x', 'y']);

    await expect(h.runRefresh()).resolves.toBeDefined();

    // The grid is exactly the final imported width — no stray column survives.
    expect(h.grid).toEqual(['a', 'c', 'x', 'y']);

    // Exactly one sentinel column is appended (and removed in the same
    // structural batch), regardless of how many columns are inserted.
    const colAppends = h.adapter.appendDimensionToSheet.mock.calls.filter(
      ([, , , dim]: [string, number, number, string]) => dim === 'COLUMNS'
    );
    expect(colAppends).toEqual([[SPREADSHEET_ID, SHEET_ID, 1, 'COLUMNS']]);
    expect(h.structuralBatch()).toHaveLength(h.columnPlan.ops.length + 1);
  });

  it('insert-only, no user columns (prevWidth=3, avail=3, deletes=0, inserts=2): first insert stays in range and no orphan column remains', async () => {
    // Pure append with the imported range filling the grid. With no deletes,
    // the first `insertDimension { inheritFromBefore: false }` lands on
    // `startIndex == prevWidth == gridSize` and the live API rejects it — yet
    // the previous `needsSentinel` predicate required `deleteCount > 0`, so the
    // guard never engaged for this case. It instead relied on pre-allocating to
    // `finalImportedNames.length`, which avoided the rejection but left
    // `insertCount` orphan columns behind.
    const h = buildStructuralWriter({
      previousImported: ['a', 'b', 'c'],
      desired: ['a', 'b', 'c', 'x', 'y'],
    });

    expect(h.columnPlan.finalImportedNames).toEqual(['a', 'b', 'c', 'x', 'y']);

    await expect(h.runRefresh()).resolves.toBeDefined();

    expect(h.grid).toEqual(['a', 'b', 'c', 'x', 'y']);
    const colAppends = h.adapter.appendDimensionToSheet.mock.calls.filter(
      ([, , , dim]: [string, number, number, string]) => dim === 'COLUMNS'
    );
    expect(colAppends).toEqual([[SPREADSHEET_ID, SHEET_ID, 1, 'COLUMNS']]);
    expect(h.structuralBatch()).toHaveLength(h.columnPlan.ops.length + 1);
  });

  it('net-growing past existing slack, one user column (prevWidth=3, avail=4, deletes=1, inserts=3): user column preserved, no orphan column', async () => {
    // A user column provides one slack column to the right, but the schema adds
    // three and drops one (net +2), so the final imported width exceeds the
    // current grid. Pre-allocating to the final width would again double-count
    // the inserts and strand the user column behind orphan cells. No sentinel
    // is needed here (the slack column keeps the first insert in range), but the
    // grid must still end at finalImportedNames + the user column.
    const h = buildStructuralWriter({
      previousImported: ['a', 'b', 'c'],
      userColsRight: ['U'],
      desired: ['a', 'c', 'x', 'y', 'z'],
    });

    expect(h.columnPlan.finalImportedNames).toEqual(['a', 'c', 'x', 'y', 'z']);

    await expect(h.runRefresh()).resolves.toBeDefined();

    expect(h.grid).toEqual(['a', 'c', 'x', 'y', 'z', 'U']);
    const colAppends = h.adapter.appendDimensionToSheet.mock.calls.filter(
      ([, , , dim]: [string, number, number, string]) => dim === 'COLUMNS'
    );
    expect(colAppends).toEqual([]);
    expect(h.structuralBatch()).toHaveLength(h.columnPlan.ops.length);
  });
});
