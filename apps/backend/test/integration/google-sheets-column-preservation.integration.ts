import { INestApplication } from '@nestjs/common';
import {
  AUTH_HEADER,
  GOOGLE_SHEETS_TEST_CONFIG,
  TestSheetHandle,
  closeTestApp,
  createTestApp,
  createTestSheet,
  seedDataMartWithSql,
  setDataMartAlias,
  setupGoogleSheetsReport,
  waitForReportCompletion,
} from '@owox/test-utils';
import { sheets_v4 } from 'googleapis';
import * as supertest from 'supertest';

/**
 * Level-4 real-Google-Sheets integration tests for the diff-based exporter.
 *
 * Validates the three DoD outcomes of the column-preservation refactor:
 *   A. Touching only the imported rectangle — user content right of imported
 *      survives a refresh.
 *   B. Mapping by `name`, alias-aware via `OWOX_COLUMNS` metadata; user-driven
 *      row-1 reorder wins; SQL add → append; SQL remove → delete + `#REF!`;
 *      Output Schema alias propagates without structural ops.
 *   C. Auto fill-down: a formula in row 2 right of the imported range is
 *      replicated to every data row on refresh (Sheets API `copyPaste` with
 *      `pasteType: 'PASTE_FORMULA'`).
 *
 * Required env vars (loaded by `setup-env.ts` from `.env.tests` locally, or
 * GitHub Actions secrets in CI):
 *   - GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON  (Editor on the test spreadsheet)
 *   - TEST_GOOGLE_SPREADSHEET_ID
 *   - BQ_SERVICE_ACCOUNT_KEY              (data mart storage credentials)
 *   - BQ_PROJECT_ID
 *
 * BQ_DATASET is NOT required because tests use SELECT … UNION ALL literals
 * — no real warehouse table is read.
 */

const {
  isConfigured: SHEETS_CONFIGURED,
  serviceAccountJson,
  spreadsheetId,
} = GOOGLE_SHEETS_TEST_CONFIG;
const BQ_SERVICE_ACCOUNT_KEY = process.env.BQ_SERVICE_ACCOUNT_KEY;
const BQ_PROJECT_ID = process.env.BQ_PROJECT_ID;

const ALL_CREDS_AVAILABLE = !!(
  SHEETS_CONFIGURED &&
  serviceAccountJson &&
  spreadsheetId &&
  BQ_SERVICE_ACCOUNT_KEY &&
  BQ_PROJECT_ID
);

if (!ALL_CREDS_AVAILABLE) {
  console.log(
    'Skipping google-sheets-column-preservation integration tests: credentials not configured'
  );
}

const describeIfConfigured = ALL_CREDS_AVAILABLE ? describe : describe.skip;

const BASE_SQL = `
  SELECT 'A' AS country, 10 AS clicks, 2 AS cost UNION ALL
  SELECT 'B' AS country, 20 AS clicks, 5 AS cost UNION ALL
  SELECT 'C' AS country, 30 AS clicks, 6 AS cost
`;

describeIfConfigured('Google Sheets column preservation (diff-based writer)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  /** Sheet provisioned in `beforeEach`, cleaned up in `afterEach`. */
  let sheet: TestSheetHandle;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;
  }, 60_000);

  afterAll(async () => {
    if (app) {
      await closeTestApp(app);
    }
  }, 60_000);

  afterEach(async () => {
    if (sheet) {
      await sheet.cleanup();
    }
  });

  /**
   * Triggers a report run and waits until it finalizes via backend status
   * polling. Replaces the legacy `setTimeout(resolve, 5000)` pattern.
   */
  async function runAndWait(reportId: string): Promise<void> {
    const beforeRes = await agent.get(`/api/reports/${reportId}`).set(AUTH_HEADER);
    expect(beforeRes.status).toBe(200);
    const runsCountBefore = beforeRes.body.runsCount as number;

    const triggerRes = await agent.post(`/api/reports/${reportId}/run`).set(AUTH_HEADER);
    expect(triggerRes.status).toBe(201);

    await waitForReportCompletion({ agent, reportId, runsCountBefore });
  }

  /**
   * Triggers a report run and expects it to finalize with `lastRunStatus =
   * 'ERROR'`. Used by the "preserve data on failed refresh" test below —
   * the helper rethrows any unexpected exception so the assertion is still
   * tight when something other than an ERROR status surfaces.
   */
  async function runAndExpectFailure(reportId: string): Promise<void> {
    const beforeRes = await agent.get(`/api/reports/${reportId}`).set(AUTH_HEADER);
    expect(beforeRes.status).toBe(200);
    const runsCountBefore = beforeRes.body.runsCount as number;

    const triggerRes = await agent.post(`/api/reports/${reportId}/run`).set(AUTH_HEADER);
    expect(triggerRes.status).toBe(201);

    let succeeded = false;
    try {
      await waitForReportCompletion({ agent, reportId, runsCountBefore });
      succeeded = true;
    } catch (err) {
      const msg = (err as Error).message ?? '';
      if (!msg.includes('finished with status ERROR')) {
        throw err;
      }
    }
    if (succeeded) {
      throw new Error('Expected report run to fail but it completed successfully');
    }
  }

  /** Provisions a fresh sheet, BQ-backed data mart, and Google Sheets report. */
  async function provisionFixture(opts: {
    testName: string;
    sql?: string;
    columnConfig?: string[] | null;
  }): Promise<{ dataMartId: string; reportId: string; dataDestinationId: string }> {
    sheet = await createTestSheet(spreadsheetId!, serviceAccountJson!, opts.testName);
    const { dataMartId } = await seedDataMartWithSql({
      agent,
      bigQueryServiceAccountJson: BQ_SERVICE_ACCOUNT_KEY!,
      bigQueryProjectId: BQ_PROJECT_ID!,
      sqlQuery: opts.sql ?? BASE_SQL,
    });
    const { reportId, dataDestinationId } = await setupGoogleSheetsReport({
      agent,
      dataMartId,
      spreadsheetId: spreadsheetId!,
      sheetId: sheet.sheetId,
      serviceAccountJson: serviceAccountJson!,
      columnConfig: opts.columnConfig,
    });
    return { dataMartId, reportId, dataDestinationId };
  }

  /** Reads row 1 of the current `sheet` as a string array (FORMATTED_VALUE). */
  async function readRow1(): Promise<string[]> {
    const res = await sheet.sheets.spreadsheets.values.get({
      spreadsheetId: sheet.spreadsheetId,
      range: `'${sheet.sheetTitle}'!1:1`,
      valueRenderOption: 'FORMATTED_VALUE',
    });
    return (res.data.values?.[0] ?? []).map(v => (v == null ? '' : String(v)));
  }

  /** Reads a row range as raw string values. */
  async function readRange(a1Range: string): Promise<string[][]> {
    const res = await sheet.sheets.spreadsheets.values.get({
      spreadsheetId: sheet.spreadsheetId,
      range: `'${sheet.sheetTitle}'!${a1Range}`,
      valueRenderOption: 'FORMATTED_VALUE',
    });
    return (res.data.values ?? []).map(row => row.map(v => (v == null ? '' : String(v))));
  }

  /** Reads a range with formulas preserved (PASTE_FORMULA assertions). */
  async function readFormulas(a1Range: string): Promise<string[][]> {
    const res = await sheet.sheets.spreadsheets.values.get({
      spreadsheetId: sheet.spreadsheetId,
      range: `'${sheet.sheetTitle}'!${a1Range}`,
      valueRenderOption: 'FORMULA',
    });
    return (res.data.values ?? []).map(row => row.map(v => (typeof v === 'string' ? v : '')));
  }

  /** Returns the parsed `OWOX_COLUMNS` metadata payload bound to `sheet.sheetId`. */
  async function readOwoxColumnsMetadata(): Promise<Array<{ name: string; alias?: string }>> {
    const res = await sheet.sheets.spreadsheets.get({
      spreadsheetId: sheet.spreadsheetId,
      includeGridData: false,
      fields:
        'developerMetadata(metadataKey,metadataValue,location),sheets(properties.sheetId,developerMetadata(metadataKey,metadataValue,location))',
    });
    const allMetadata: sheets_v4.Schema$DeveloperMetadata[] = [
      ...(res.data.developerMetadata ?? []),
      ...(res.data.sheets ?? []).flatMap(s => s.developerMetadata ?? []),
    ];
    const owoxColumns = allMetadata.find(
      m => m.metadataKey === 'OWOX_COLUMNS' && m.location?.sheetId === sheet.sheetId
    );
    if (!owoxColumns?.metadataValue) {
      throw new Error(`OWOX_COLUMNS metadata missing on sheet ${sheet.sheetId}`);
    }
    return JSON.parse(owoxColumns.metadataValue) as Array<{ name: string; alias?: string }>;
  }

  /** Writes a single value/formula into a cell (used to seed user content). */
  async function writeCell(a1: string, value: string): Promise<void> {
    await sheet.sheets.spreadsheets.values.update({
      spreadsheetId: sheet.spreadsheetId,
      range: `'${sheet.sheetTitle}'!${a1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[value]] },
    });
  }

  // -------------------------------------------------------------------------
  // Test 1 — First run lays down SQL order + persists OWOX_COLUMNS metadata
  // -------------------------------------------------------------------------
  it('first run writes columns in SQL order and persists OWOX_COLUMNS metadata', async () => {
    const { reportId } = await provisionFixture({ testName: 'first-run' });
    await runAndWait(reportId);

    expect(await readRow1()).toEqual(['country', 'clicks', 'cost']);
    expect(await readRange('A2:C4')).toEqual([
      ['A', '10', '2'],
      ['B', '20', '5'],
      ['C', '30', '6'],
    ]);
    expect(await readOwoxColumnsMetadata()).toEqual([
      { name: 'country' },
      { name: 'clicks' },
      { name: 'cost' },
    ]);
  }, 90_000);

  // -------------------------------------------------------------------------
  // Test 2 — DoD A: user content right of imported range survives refresh
  // -------------------------------------------------------------------------
  it('preserves user formulas and content right of the imported range across refresh', async () => {
    const { reportId } = await provisionFixture({ testName: 'right-of-imported' });
    await runAndWait(reportId);

    await writeCell('K1', 'ratio');
    await writeCell('K2', '=B2/C2');

    await runAndWait(reportId);

    const [k1Header] = (await readRange('K1:K1'))[0] ?? [];
    expect(k1Header).toBe('ratio');

    const [k2Formula] = (await readFormulas('K2:K2'))[0] ?? [];
    expect(k2Formula).toBe('=B2/C2');

    // Imported header row is unchanged. We slice to the imported width
    // because row 1 also holds the user header `K1='ratio'`, which must
    // survive the refresh — that is exactly what we are verifying here.
    expect((await readRow1()).slice(0, 3)).toEqual(['country', 'clicks', 'cost']);
  }, 90_000);

  // -------------------------------------------------------------------------
  // Test 3 — DoD B: user-driven column reorder wins over SQL order
  // -------------------------------------------------------------------------
  it('keeps user-driven row-1 reorder across refresh', async () => {
    const { reportId } = await provisionFixture({ testName: 'user-reorder' });
    await runAndWait(reportId);

    // User drags column B (clicks) to be after column C (cost).
    await sheet.sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheet.spreadsheetId,
      requestBody: {
        requests: [
          {
            moveDimension: {
              source: {
                sheetId: sheet.sheetId,
                dimension: 'COLUMNS',
                startIndex: 1,
                endIndex: 2,
              },
              // moveDimension destination is interpreted as "before this index"
              // in the original frame — index 3 = after column C.
              destinationIndex: 3,
            },
          },
        ],
      },
    });

    expect(await readRow1()).toEqual(['country', 'cost', 'clicks']);

    await runAndWait(reportId);

    expect(await readRow1()).toEqual(['country', 'cost', 'clicks']);
    // Data rows realigned with the user-driven column order.
    expect(await readRange('A2:C4')).toEqual([
      ['A', '2', '10'],
      ['B', '5', '20'],
      ['C', '6', '30'],
    ]);
    expect(await readOwoxColumnsMetadata()).toEqual([
      { name: 'country' },
      { name: 'cost' },
      { name: 'clicks' },
    ]);
  }, 90_000);

  // -------------------------------------------------------------------------
  // Test 4 — DoD B: new SQL column appended at the right edge of imported range
  // -------------------------------------------------------------------------
  it('appends a new SQL column at the right edge without disturbing user content', async () => {
    // First report: 3-column SQL.
    const v1 = await provisionFixture({ testName: 'add-column-v1' });
    await runAndWait(v1.reportId);

    // Place a marker user cell beyond the imported range.
    await writeCell('F1', 'user_marker');

    // Second report on the SAME sheet, using a 4-column data mart. The writer
    // reads the existing OWOX_COLUMNS (`[country, clicks, cost]`) and diffs.
    const SQL_V2 = `
      SELECT 'A' AS country, 10 AS clicks, 2 AS cost, 1.5 AS conversion_rate UNION ALL
      SELECT 'B' AS country, 20 AS clicks, 5 AS cost, 2.0 AS conversion_rate UNION ALL
      SELECT 'C' AS country, 30 AS clicks, 6 AS cost, 1.8 AS conversion_rate
    `;
    const { dataMartId } = await seedDataMartWithSql({
      agent,
      bigQueryServiceAccountJson: BQ_SERVICE_ACCOUNT_KEY!,
      bigQueryProjectId: BQ_PROJECT_ID!,
      sqlQuery: SQL_V2,
      title: 'Integration Test DM v2',
    });
    const { reportId: reportV2 } = await setupGoogleSheetsReport({
      agent,
      dataMartId,
      spreadsheetId: spreadsheetId!,
      sheetId: sheet.sheetId,
      serviceAccountJson: serviceAccountJson!,
      reportTitle: 'Integration Test GS Report v2',
    });
    await runAndWait(reportV2);

    // Slice to the imported width — row 1 also still holds `user_marker`
    // (now shifted from F1 to G1 by the structural insert), which must
    // survive the refresh.
    expect((await readRow1()).slice(0, 4)).toEqual([
      'country',
      'clicks',
      'cost',
      'conversion_rate',
    ]);
    const cols = await readOwoxColumnsMetadata();
    expect(cols.map(c => c.name)).toEqual(['country', 'clicks', 'cost', 'conversion_rate']);

    // user_marker that lived in column F (index 5) is shifted by an
    // insertDimension into column G — verify it survived.
    expect((await readRange('G1:G1'))[0]?.[0]).toBe('user_marker');
  }, 120_000);

  // -------------------------------------------------------------------------
  // Test 5 — DoD B: removed SQL column → user formula goes #REF!
  // -------------------------------------------------------------------------
  it('removes columns dropped from SQL; dependent user formulas become #REF!', async () => {
    const v1 = await provisionFixture({ testName: 'remove-column-v1' });
    await runAndWait(v1.reportId);

    // User formula depends on the `clicks` column (currently column B).
    await writeCell('E2', '=B2/C2');

    const SQL_V2 = `
      SELECT 'A' AS country, 2 AS cost UNION ALL
      SELECT 'B' AS country, 5 AS cost UNION ALL
      SELECT 'C' AS country, 6 AS cost
    `;
    const { dataMartId } = await seedDataMartWithSql({
      agent,
      bigQueryServiceAccountJson: BQ_SERVICE_ACCOUNT_KEY!,
      bigQueryProjectId: BQ_PROJECT_ID!,
      sqlQuery: SQL_V2,
      title: 'Integration Test DM remove-v2',
    });
    const { reportId: reportV2 } = await setupGoogleSheetsReport({
      agent,
      dataMartId,
      spreadsheetId: spreadsheetId!,
      sheetId: sheet.sheetId,
      serviceAccountJson: serviceAccountJson!,
      reportTitle: 'Integration Test GS Report remove-v2',
    });
    await runAndWait(reportV2);

    expect(await readRow1()).toEqual(['country', 'cost']);
    expect((await readOwoxColumnsMetadata()).map(c => c.name)).toEqual(['country', 'cost']);

    // The user formula was at E2; after `deleteDimension` shifted columns
    // left by one, it is now at D2. Sheets rewrites the broken ref in place
    // (#REF!) — surface it via FORMULA + FORMATTED value alternatives.
    const [d2Formula] = (await readFormulas('D2:D2'))[0] ?? [];
    const [d2Value] = (await readRange('D2:D2'))[0] ?? [];
    expect((d2Formula ?? '') + ' ' + (d2Value ?? '')).toMatch(/#REF!/);
  }, 120_000);

  // -------------------------------------------------------------------------
  // Test 6 — DoD B: alias-aware mapping (Output Schema alias)
  // -------------------------------------------------------------------------
  it('maps row-1 aliases back to canonical names without structural ops', async () => {
    const { dataMartId, reportId } = await provisionFixture({ testName: 'alias-mapping' });
    await runAndWait(reportId);

    expect(await readRow1()).toEqual(['country', 'clicks', 'cost']);
    expect(await readOwoxColumnsMetadata()).toEqual([
      { name: 'country' },
      { name: 'clicks' },
      { name: 'cost' },
    ]);

    // Place a probe in user territory; if the writer accidentally re-runs
    // structural ops it would shift this cell.
    await writeCell('K1', 'probe');

    // Action 1: set alias on `country`.
    await setDataMartAlias(agent, dataMartId, 'country', 'Country');
    await runAndWait(reportId);

    // Slice to the imported width — `K1='probe'` (user content) lives
    // further right and must survive untouched.
    expect((await readRow1()).slice(0, 3)).toEqual(['Country', 'clicks', 'cost']);
    expect(await readOwoxColumnsMetadata()).toEqual([
      { name: 'country', alias: 'Country' },
      { name: 'clicks' },
      { name: 'cost' },
    ]);
    expect((await readRange('K1:K1'))[0]?.[0]).toBe('probe'); // no structural ops happened

    // Action 2: drop the alias.
    await setDataMartAlias(agent, dataMartId, 'country', null);
    await runAndWait(reportId);

    expect((await readRow1()).slice(0, 3)).toEqual(['country', 'clicks', 'cost']);
    expect(await readOwoxColumnsMetadata()).toEqual([
      { name: 'country' },
      { name: 'clicks' },
      { name: 'cost' },
    ]);
    expect((await readRange('K1:K1'))[0]?.[0]).toBe('probe');
  }, 120_000);

  // -------------------------------------------------------------------------
  // Test 7 — DoD C: auto fill-down replicates row-2 user formula
  // -------------------------------------------------------------------------
  it('replicates a user fill-down formula across data rows on refresh', async () => {
    const { reportId } = await provisionFixture({ testName: 'auto-fill-down' });
    await runAndWait(reportId);

    // Seed a single formula in row 2; rows 3..N stay blank by default.
    await writeCell('K2', '=B2/C2');

    await runAndWait(reportId);

    // Sheets shifts relative refs the same way drag-fill does.
    expect((await readFormulas('K2:K4')).flat()).toEqual(['=B2/C2', '=B3/C3', '=B4/C4']);
  }, 120_000);

  // -------------------------------------------------------------------------
  // Test 7b — Static values right of imported range are NOT overwritten by
  // fill-down (C2 + H7). A user lookup table that sits in column K starting
  // from row 5 must survive refresh untouched, even though row 2 of the
  // same column holds a formula that should fill down across rows 3..N.
  // -------------------------------------------------------------------------
  it('does not overwrite static values right of imported range when only some rows hold formulas', async () => {
    const { reportId } = await provisionFixture({ testName: 'fill-down-static-value' });
    await runAndWait(reportId);

    // Seed a formula in row 2 (should fill down) AND a static value in
    // column L (no formula in row 2 → must NOT be touched).
    await writeCell('K2', '=B2/C2');
    await writeCell('L5', '999');

    await runAndWait(reportId);

    // Formula column: rows 2..4 carry shifted refs.
    expect((await readFormulas('K2:K4')).flat()).toEqual(['=B2/C2', '=B3/C3', '=B4/C4']);
    // Static-value column: row 5 still has the user value. If the writer
    // blindly applied PASTE_FORMULA over the whole user block, this cell
    // would have been cleared.
    expect((await readRange('L5:L5'))[0]?.[0]).toBe('999');
  }, 120_000);

  // -------------------------------------------------------------------------
  // Test 8 — Report Columns picker (`columnConfig`) filters the export
  // -------------------------------------------------------------------------
  it('honors the Report Columns picker (columnConfig) to omit columns from the export', async () => {
    const { reportId } = await provisionFixture({
      testName: 'column-picker',
      columnConfig: ['country', 'cost'],
    });
    await runAndWait(reportId);

    expect(await readRow1()).toEqual(['country', 'cost']);
    expect((await readOwoxColumnsMetadata()).map(c => c.name)).toEqual(['country', 'cost']);
  }, 90_000);

  // -------------------------------------------------------------------------
  // Test 9 — Failed refresh leaves the sheet exactly as it was (no data loss)
  //
  // Covers the user-facing scenario the PM raised: refresh fails (warehouse
  // error / connection drop / malformed SQL caught at execution) → user
  // opens the sheet expecting their previous data and must NOT find an
  // empty / half-updated state. The writer satisfies this by deferring all
  // destructive operations (structural ops + writeHeaders) until the first
  // successful `writeReportDataBatch`. If the reader fails before that, the
  // writer issued zero mutations and the sheet is byte-for-byte the same as
  // before the failed refresh.
  // -------------------------------------------------------------------------
  it('preserves the previous data when the refresh fails before producing any batch', async () => {
    // 1. First refresh: succeeds with normal SQL and populates the sheet.
    const { reportId: v1ReportId } = await provisionFixture({ testName: 'failed-refresh' });
    await runAndWait(v1ReportId);
    const dataBefore = await readRange('A2:C4');
    const metadataBefore = await readOwoxColumnsMetadata();
    expect((await readRow1()).slice(0, 3)).toEqual(['country', 'clicks', 'cost']);

    // Seed a user marker right of the imported range — must also survive.
    await writeCell('K1', 'preserve_me');

    // 2. Spin up a SECOND data mart whose SQL fails at runtime. Bind a new
    //    report to the SAME sheet — when its refresh fails before the
    //    first batch, the writer must leave the sheet exactly as it is.
    const failingSql = `SELECT ERROR('intentional integration-test failure') AS x FROM UNNEST([1, 2, 3])`;
    const { dataMartId: failingDmId } = await seedDataMartWithSql({
      agent,
      bigQueryServiceAccountJson: BQ_SERVICE_ACCOUNT_KEY!,
      bigQueryProjectId: BQ_PROJECT_ID!,
      sqlQuery: failingSql,
      title: 'Integration Test DM failing',
    });
    const { reportId: failingReportId } = await setupGoogleSheetsReport({
      agent,
      dataMartId: failingDmId,
      spreadsheetId: spreadsheetId!,
      sheetId: sheet.sheetId,
      serviceAccountJson: serviceAccountJson!,
      reportTitle: 'Integration Test GS Report failing',
    });

    await runAndExpectFailure(failingReportId);

    // 3. Sheet content is unchanged:
    //   - imported portion of row 1 still holds the original headers
    //     (cells past column C are blank up to K1, where the user marker
    //     lives — sliced for readability),
    //   - data rows untouched,
    //   - user marker in K1 survived,
    //   - OWOX_COLUMNS metadata did not advance its layout pointer.
    expect((await readRow1()).slice(0, 3)).toEqual(['country', 'clicks', 'cost']);
    expect(await readRange('A2:C4')).toEqual(dataBefore);
    expect((await readRange('K1:K1'))[0]?.[0]).toBe('preserve_me');
    expect(await readOwoxColumnsMetadata()).toEqual(metadataBefore);
  }, 120_000);

  // -------------------------------------------------------------------------
  // Test 9b — Inside the imported rectangle, manual edits NEVER survive a
  // refresh, even when SQL returns NULL for that cell.
  //
  // Pre-fix: `null` in the 2D array passed to Sheets `values.update` is
  // treated as "skip this cell", so a user's manual edit on a cell that the
  // new SQL produces NULL for would silently survive across refresh. The
  // formatter now coerces nullish to "" so the cell is explicitly cleared.
  // -------------------------------------------------------------------------
  it('overwrites manual edits inside imported range even when SQL produces NULL', async () => {
    // Row 2: clicks = NULL. Row 3: clicks = 20. Lets us assert both halves of
    // the contract in one report run.
    const SQL_WITH_NULL = `
      SELECT 'A' AS country, CAST(NULL AS INT64) AS clicks, 2 AS cost UNION ALL
      SELECT 'B' AS country, 20 AS clicks, 5 AS cost
    `;
    const { reportId } = await provisionFixture({
      testName: 'null-overwrites-manual-edit',
      sql: SQL_WITH_NULL,
    });
    await runAndWait(reportId);

    // Seed manual edits inside the imported rectangle:
    //   B2 — the cell that SQL will produce NULL for on next refresh
    //   B3 — the cell that SQL will produce 20 for on next refresh (control)
    await writeCell('B2', 'manual-keep-me');
    await writeCell('B3', 'manual-also');

    await runAndWait(reportId);

    // B2: was NULL in SQL → must be cleared (pre-fix this kept "manual-keep-me").
    // B3: was 20 in SQL → must be overwritten with "20".
    expect(await readRange('A2:C3')).toEqual([
      ['A', '', '2'],
      ['B', '20', '5'],
    ]);
  }, 120_000);

  // -------------------------------------------------------------------------
  // Test 10 — Output Controls × diff-based writer interaction:
  // shrinking the result set via Report `limitConfig` must clear stale rows
  // from the previous (larger) refresh inside the imported rectangle. User
  // content right of the imported range survives (DoD A still holds).
  //
  // This is exactly the user-visible regression that triggered the fix:
  // a refresh with LIMIT=1 wrote one row but ten old rows lingered below it,
  // making it look like the limit was being ignored.
  // -------------------------------------------------------------------------
  it('clears stale rows below new data when limitConfig shrinks the result set', async () => {
    const { reportId, dataDestinationId } = await provisionFixture({
      testName: 'limit-shrinks-rows',
    });

    // First run — full 3-row dataset lands in rows 2..4.
    await runAndWait(reportId);
    expect(await readRange('A2:C4')).toEqual([
      ['A', '10', '2'],
      ['B', '20', '5'],
      ['C', '30', '6'],
    ]);

    // Seed user content right of the imported range — must survive.
    await writeCell('K1', 'ratio');
    await writeCell('K2', '=B2/C2');

    // Apply LIMIT=1 via PUT. Send only the required DTO fields plus
    // `limitConfig`; class-validator's `@IsOptional()` lets us omit the
    // unrelated optional fields (filterConfig / sortConfig / ownerIds /
    // columnConfig), matching the working pattern in
    // `output-controls.e2e-spec.ts`. Round-tripping the full GET body
    // previously triggered a 400 — likely from sending nullable optional
    // fields back as explicit `null` or owner ids missing on the response.
    const putRes = await agent
      .put(`/api/reports/${reportId}`)
      .set(AUTH_HEADER)
      .send({
        title: 'Integration Test GS Report (limit=1)',
        dataDestinationId,
        destinationConfig: {
          type: 'google-sheets-config',
          spreadsheetId,
          sheetId: sheet.sheetId,
        },
        limitConfig: 1,
      });
    expect(putRes.status).toBe(200);

    await runAndWait(reportId);

    // Row 2 holds the single LIMIT=1 record; rows 3..4 in the imported
    // columns are blank now (Sheets API strips trailing empty rows from the
    // values response, so an empty array is the expected shape).
    expect(await readRange('A2:C2')).toEqual([['A', '10', '2']]);
    expect(await readRange('A3:C4')).toEqual([]);

    // User content right of the imported range survived.
    expect((await readRange('K1:K1'))[0]?.[0]).toBe('ratio');
    expect((await readFormulas('K2:K2'))[0]?.[0]).toBe('=B2/C2');
  }, 150_000);
});
