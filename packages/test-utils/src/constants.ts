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
