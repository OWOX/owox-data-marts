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

export const GOOGLE_SHEETS_TEST_CONFIG = {
  serviceAccountJson: process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON,
  spreadsheetId: process.env.TEST_GOOGLE_SPREADSHEET_ID,
  sheetId: parseInt(process.env.TEST_GOOGLE_SHEET_ID ?? '0', 10),
  sheetId2: parseInt(process.env.TEST_GOOGLE_SHEET_ID_2 ?? '1', 10),
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
