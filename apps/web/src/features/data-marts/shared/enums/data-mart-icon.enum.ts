/**
 * Recommended icon keys — the picker's first section. They mirror the
 * backend's `DataMartIcon` set, so adding one means adding it there too. The
 * glyph and label for each key live in the icon registry
 * (`shared/components/DataMartIcon`).
 */
export const DATA_MART_ICON_KEYS = [
  'purchases',
  'orders',
  'products',
  'inventory',
  'revenue',
  'finance',
  'ad-spend',
  'campaigns',
  'traffic-sources',
  'sessions',
  'pageviews',
  'events',
  'conversions',
  'customers',
  'users',
  'leads',
  'countries',
  'devices',
  'email',
  'keywords',
  'social',
  'subscriptions',
  'calendar',
  'support',
  'database',
  'table',
  'payments',
  'invoices',
  'refunds',
  'carts',
  'shipping',
  'promotions',
  'stores',
  'exchange-rates',
  'creatives',
  'video',
  'websites',
  'landing-pages',
  'content',
  'deals',
  'companies',
  'calls',
  'reviews',
  'funnels',
  'segments',
  'experiments',
  'kpis',
  'forecasts',
  'data-sources',
  'pipelines',
  'sql',
  'api',
  'cloud',
  'servers',
  'reports',
  'spreadsheets',
  'dashboards',
  'charts',
  'joins',
  'schemas',
  'dimensions',
  'metrics',
  'data-quality',
  'history',
  'utm',
  'attribution',
  'channels',
  'budgets',
  'goals',
  'identities',
  'cohorts',
  'alerts',
  'impressions',
] as const;

export type DataMartIconKey = (typeof DATA_MART_ICON_KEYS)[number];

/** Prefix of an icon value that names any lucide icon instead of a recommended key. */
export const LUCIDE_ICON_PREFIX = 'lucide:';

/** A lucide icon: `lucide:` plus its kebab-case name, e.g. `lucide:shopping-cart`. */
export type LucideIconValue = `${typeof LUCIDE_ICON_PREFIX}${string}`;

/** What a Data Mart's `icon` holds in the API: a recommended key or a lucide icon. */
export type DataMartIconValue = DataMartIconKey | LucideIconValue;
