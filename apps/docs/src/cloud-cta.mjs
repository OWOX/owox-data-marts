// "Try it free" CTA to OWOX Cloud: which docs pages show it and where it leads.
// Product pages get it; pages for existing customers, self-hosting,
// API/plugin authors and repository contributors do not.

export const CLOUD_CTA_URL = 'https://www.owox.com/app-signup';

const INCLUDED_PAGES = new Set([
  '',
  'docs/getting-started/quick-start',
  'docs/getting-started/core-concepts',
  'docs/getting-started/first-data-mart',
  'docs/data-marts',
  'docs/reports',
  'docs/connectors',
  'docs/connectors/custom-connectors',
  'docs/connectors/connector-builder',
]);

const INCLUDED_SECTIONS = [
  'docs/getting-started/best-practices/',
  'docs/getting-started/setup-guide/',
  'docs/destinations',
  'docs/storages',
  'docs/templates/',
  'packages/connectors/src/sources/',
];

const EXCLUDED_SECTIONS = [
  'docs/getting-started/setup-guide/members-management/',
  'docs/storages/supported-storages/google-bigquery-used-in-owox-extension',
];

// Readers of a connector's troubleshooting page are already running it.
const EXCLUDED_SOURCE_PAGES = ['troubleshooting'];

/**
 * @param {string} id Starlight route id, e.g. `docs/reports` or `docs/reports/index`
 * @returns {boolean}
 */
export function shouldShowCloudCta(id) {
  const path = id.replace(/^\/+|\/+$/g, '').replace(/(^|\/)index$/, '');

  if (EXCLUDED_SECTIONS.some(section => path.startsWith(section))) return false;
  if (
    path.startsWith('packages/connectors/src/sources/') &&
    EXCLUDED_SOURCE_PAGES.includes(path.split('/').pop())
  ) {
    return false;
  }

  return INCLUDED_PAGES.has(path) || INCLUDED_SECTIONS.some(section => path.startsWith(section));
}
