export const AUTH_HEADER: Record<string, string> = {
  'x-owox-authorization': 'test-token',
};

export const NONEXISTENT_UUID = '00000000-0000-0000-0000-000000000000';

export const LOOKER_STUDIO_CONFIG = {
  type: 'looker-studio-config' as const,
  cacheLifetime: 3600,
};

export const LOOKER_STUDIO_CREDENTIALS = {
  type: 'looker-studio-credentials' as const,
};

export const DEFAULT_CRON = '0 * * * *';

/**
 * Required env vars to enable any Google Sheets integration test against the
 * real Sheets API:
 *
 *   - GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON — full service-account JSON; the
 *     account must have **Editor** access on `TEST_GOOGLE_SPREADSHEET_ID`
 *     (sheet add/delete needs Editor).
 *   - TEST_GOOGLE_SPREADSHEET_ID — the shared test spreadsheet inside which
 *     each test creates and deletes its own ephemeral tab.
 *
 * Suites that need a concrete pre-existing tab (e.g. the legacy
 * `google-sheets.integration.ts`) read their own sheet IDs directly from
 * `process.env` — we deliberately keep those out of this shared config so
 * suites that provision sheets on demand (the column-preservation suite)
 * stay decoupled from per-tab fixtures.
 */
export const GOOGLE_SHEETS_TEST_CONFIG = {
  serviceAccountJson: process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON,
  spreadsheetId: process.env.TEST_GOOGLE_SPREADSHEET_ID,
  isConfigured: !!(
    process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON && process.env.TEST_GOOGLE_SPREADSHEET_ID
  ),
} as const;

export const ALL_CONNECTORS = [
  'BankOfCanada',
  'CriteoAds',
  'FacebookMarketing',
  'GitHub',
  'GoogleAds',
  'GoogleSheets',
  'LinkedInAds',
  'LinkedInPages',
  'MicrosoftAds',
  'OpenExchangeRates',
  'OpenHolidays',
  'RedditAds',
  'Shopify',
  'TikTokAds',
  'XAds',
] as const;
