/**
 * Recommended icons a user picks for a Data Mart so its subject reads at a
 * glance (on the Models canvas and in the Data Mart header). The web app maps
 * each key to a drawn icon. Beyond this set a Data Mart can carry any icon of
 * the web's icon library as `lucide:<icon-name>` (see `DataMartIconValue`).
 * `null` on the Data Mart means "no choice" and renders the default icon.
 */
export enum DataMartIcon {
  PURCHASES = 'purchases',
  ORDERS = 'orders',
  PRODUCTS = 'products',
  INVENTORY = 'inventory',
  REVENUE = 'revenue',
  FINANCE = 'finance',
  AD_SPEND = 'ad-spend',
  CAMPAIGNS = 'campaigns',
  TRAFFIC_SOURCES = 'traffic-sources',
  SESSIONS = 'sessions',
  PAGEVIEWS = 'pageviews',
  EVENTS = 'events',
  CONVERSIONS = 'conversions',
  CUSTOMERS = 'customers',
  USERS = 'users',
  LEADS = 'leads',
  COUNTRIES = 'countries',
  DEVICES = 'devices',
  EMAIL = 'email',
  KEYWORDS = 'keywords',
  SOCIAL = 'social',
  SUBSCRIPTIONS = 'subscriptions',
  CALENDAR = 'calendar',
  SUPPORT = 'support',
  DATABASE = 'database',
  TABLE = 'table',
  CARTS = 'carts',
  SHIPPING = 'shipping',
  STORES = 'stores',
  PROMOTIONS = 'promotions',
  PAYMENTS = 'payments',
  INVOICES = 'invoices',
  REFUNDS = 'refunds',
  EXCHANGE_RATES = 'exchange-rates',
  CREATIVES = 'creatives',
  VIDEO = 'video',
  WEBSITES = 'websites',
  LANDING_PAGES = 'landing-pages',
  CONTENT = 'content',
  COMPANIES = 'companies',
  DEALS = 'deals',
  CALLS = 'calls',
  REVIEWS = 'reviews',
  FUNNELS = 'funnels',
  SEGMENTS = 'segments',
  EXPERIMENTS = 'experiments',
  KPIS = 'kpis',
  FORECASTS = 'forecasts',
  DATA_SOURCES = 'data-sources',
  PIPELINES = 'pipelines',
  SQL = 'sql',
  API = 'api',
  CLOUD = 'cloud',
  SERVERS = 'servers',
  REPORTS = 'reports',
  SPREADSHEETS = 'spreadsheets',
  DASHBOARDS = 'dashboards',
  CHARTS = 'charts',
  JOINS = 'joins',
  SCHEMAS = 'schemas',
  DIMENSIONS = 'dimensions',
  METRICS = 'metrics',
  DATA_QUALITY = 'data-quality',
  HISTORY = 'history',
  UTM = 'utm',
  ATTRIBUTION = 'attribution',
  CHANNELS = 'channels',
  BUDGETS = 'budgets',
  GOALS = 'goals',
  IDENTITIES = 'identities',
  COHORTS = 'cohorts',
  ALERTS = 'alerts',
  IMPRESSIONS = 'impressions',
}

/** Prefix of an icon value that names an icon of the web's icon library (lucide). */
export const LUCIDE_ICON_PREFIX = 'lucide:';

/** A library icon: `lucide:` plus its kebab-case name, e.g. `lucide:shopping-cart`. */
export type LucideIconValue = `${typeof LUCIDE_ICON_PREFIX}${string}`;

/** What a Data Mart's `icon` holds: a recommended key or a library icon. */
export type DataMartIconValue = DataMartIcon | LucideIconValue;

/** Longest icon value the `data_mart.icon` column stores. */
export const DATA_MART_ICON_MAX_LENGTH = 64;

/**
 * Accepts a recommended key or `lucide:<kebab-case-name>`. The backend checks
 * only the shape of a library name: the web draws the default icon for a name
 * its library does not know, so a stale or mistyped one never breaks a page.
 */
export const DATA_MART_ICON_PATTERN = new RegExp(
  `^(?:${Object.values(DataMartIcon).join('|')}|${LUCIDE_ICON_PREFIX}[a-z0-9]+(?:-[a-z0-9]+)*)$`
);

export const DATA_MART_ICON_API_DESCRIPTION =
  'A recommended icon key (e.g. `purchases`) or any lucide icon as `lucide:<icon-name>` ' +
  '(e.g. `lucide:shopping-cart`).';
