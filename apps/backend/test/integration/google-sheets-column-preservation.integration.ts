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

  /** Provisions a fresh sheet, BQ-backed data mart, and Google Sheets report. */
  async function provisionFixture(opts: {
    testName: string;
    sql?: string;
    columnConfig?: string[] | null;
  }): Promise<{ dataMartId: string; reportId: string }> {
    sheet = await createTestSheet(spreadsheetId!, serviceAccountJson!, opts.testName);
    const { dataMartId } = await seedDataMartWithSql({
      agent,
      bigQueryServiceAccountJson: BQ_SERVICE_ACCOUNT_KEY!,
      bigQueryProjectId: BQ_PROJECT_ID!,
      sqlQuery: opts.sql ?? BASE_SQL,
    });
    const { reportId } = await setupGoogleSheetsReport({
      agent,
      dataMartId,
      spreadsheetId: spreadsheetId!,
      sheetId: sheet.sheetId,
      serviceAccountJson: serviceAccountJson!,
      columnConfig: opts.columnConfig,
    });
    return { dataMartId, reportId };
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

    // Imported header row is unchanged.
    expect(await readRow1()).toEqual(['country', 'clicks', 'cost']);
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

    expect(await readRow1()).toEqual(['country', 'clicks', 'cost', 'conversion_rate']);
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

    expect(await readRow1()).toEqual(['Country', 'clicks', 'cost']);
    expect(await readOwoxColumnsMetadata()).toEqual([
      { name: 'country', alias: 'Country' },
      { name: 'clicks' },
      { name: 'cost' },
    ]);
    expect((await readRange('K1:K1'))[0]?.[0]).toBe('probe'); // no structural ops happened

    // Action 2: drop the alias.
    await setDataMartAlias(agent, dataMartId, 'country', null);
    await runAndWait(reportId);

    expect(await readRow1()).toEqual(['country', 'clicks', 'cost']);
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
});
