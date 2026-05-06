import { randomBytes } from 'crypto';
import { google, sheets_v4 } from 'googleapis';

/**
 * Handle returned by {@link createTestSheet}. Owns one ephemeral sheet inside
 * a shared test spreadsheet plus an authed `googleapis` client that callers
 * can reuse for direct sheet mutations (e.g. simulating user edits).
 *
 * `cleanup()` deletes the sheet and is idempotent — safe to call from
 * `afterEach` even if the underlying request already happened. It swallows
 * errors (with a warn log) so a teardown failure can never mask the test
 * outcome.
 */
export interface TestSheetHandle {
  sheetId: number;
  sheetTitle: string;
  spreadsheetId: string;
  sheets: sheets_v4.Sheets;
  cleanup(): Promise<void>;
}

const TITLE_MAX_LENGTH = 80;
const RANDOM_SUFFIX_BYTES = 3;

/**
 * Provisions a brand-new ephemeral sheet inside the shared test spreadsheet.
 *
 * Title shape: `it-{Date.now()}-{rand}-{slug(baseName)}` — the timestamp +
 * random suffix isolate parallel CI runs that target the same spreadsheet,
 * the slug makes the sheet identifiable in the UI when debugging.
 *
 * @param spreadsheetId  the shared test spreadsheet ID (from env)
 * @param serviceAccountJson  raw JSON string of a service account with Editor
 *   access to the spreadsheet (sheet add/delete needs Editor)
 * @param baseName  human-readable suffix; usually the test name. Sliced to
 *   keep total title under Sheets' 100-character limit.
 */
export async function createTestSheet(
  spreadsheetId: string,
  serviceAccountJson: string,
  baseName: string
): Promise<TestSheetHandle> {
  const credentials = JSON.parse(serviceAccountJson) as {
    client_email: string;
    private_key: string;
  };
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const sheetTitle = buildSheetTitle(baseName);
  const addRes = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: sheetTitle } } }],
    },
  });
  const sheetId = addRes.data.replies?.[0]?.addSheet?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) {
    throw new Error(`Failed to obtain sheetId from addSheet reply for title "${sheetTitle}"`);
  }

  let cleanedUp = false;
  return {
    sheetId,
    sheetTitle,
    spreadsheetId,
    sheets,
    async cleanup(): Promise<void> {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      try {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: { requests: [{ deleteSheet: { sheetId } }] },
        });
      } catch (err) {
        // Cleanup must never mask a test result — log and move on.
        // eslint-disable-next-line no-console
        console.warn(`Failed to delete test sheet ${sheetTitle} (id=${sheetId}):`, err);
      }
    },
  };
}

function buildSheetTitle(baseName: string): string {
  const rand = randomBytes(RANDOM_SUFFIX_BYTES).toString('hex');
  const slug =
    baseName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'test';
  const fullTitle = `it-${Date.now()}-${rand}-${slug}`;
  return fullTitle.length > TITLE_MAX_LENGTH ? fullTitle.slice(0, TITLE_MAX_LENGTH) : fullTitle;
}
