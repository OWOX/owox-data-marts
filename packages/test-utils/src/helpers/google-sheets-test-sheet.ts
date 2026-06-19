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
 * Retry policy for the test's direct Sheets API calls.
 *
 * The whole suite runs as a single service account, so every read/write counts
 * against one user's per-minute Sheets quota (default 60 read + 60 write per
 * minute per user). On a fast CI runner the assertion reads bunch up and burst
 * past that window, surfacing as HTTP 429 `Quota exceeded ... Read requests per
 * minute per user`. Locally the higher network latency spaces calls out enough
 * to stay under the limit, which is why this only bites in CI.
 *
 * googleapis' default backoff (3 tries, ~1–4s) is far too short to outlast a
 * per-minute quota window, so we retry 429/5xx more times with a longer capped
 * delay (~2,4,8,16,30,30s ≈ 90s total) — enough for the sliding window to free
 * up budget. Only 429/5xx are retried; a 429 is rejected before the request
 * applies, so retrying writes is safe.
 */
const SHEETS_RETRY_CONFIG = {
  retry: 6,
  retryDelay: 2000,
  maxRetryDelay: 30_000,
  httpMethodsToRetry: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
  statusCodesToRetry: [
    [429, 429],
    [500, 599],
  ],
  onRetryAttempt: (err: { message?: string }) => {
    // eslint-disable-next-line no-console
    console.warn(`Retrying Sheets API call after error: ${err?.message ?? 'unknown error'}`);
  },
};

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
  const sheets = google.sheets({ version: 'v4', auth, retryConfig: SHEETS_RETRY_CONFIG });

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
