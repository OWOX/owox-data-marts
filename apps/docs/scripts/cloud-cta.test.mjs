import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldShowCloudCta } from '../src/cloud-cta.mjs';

test('shows the CTA on product pages', () => {
  for (const id of [
    '',
    'docs/getting-started/quick-start',
    'docs/getting-started/core-concepts',
    'docs/getting-started/first-data-mart',
    'docs/getting-started/best-practices/data-model-design',
    'docs/data-marts',
    'docs/getting-started/setup-guide/joinable-data-marts',
    'docs/getting-started/setup-guide/mcp',
    'docs/reports',
    'docs/destinations',
    'docs/destinations/manage-destinations',
    'docs/destinations/supported-destinations/google-sheets',
    'docs/storages',
    'docs/storages/supported-storages/snowflake',
    'docs/connectors',
    'docs/connectors/custom-connectors',
    'docs/connectors/connector-builder',
    'docs/templates/ga4bigquery/define-ga4-sessions',
    'packages/connectors/src/sources/tik-tok-ads/readme',
    'packages/connectors/src/sources/tik-tok-ads/getting-started',
    'packages/connectors/src/sources/tik-tok-ads/credentials',
    'packages/connectors/src/sources/facebook-marketing/endpoints-and-fields',
  ]) {
    assert.equal(shouldShowCloudCta(id), true, id);
  }
});

test('hides the CTA on pages for existing users, self-hosting and contributors', () => {
  for (const id of [
    'docs/getting-started/billing/consumption-units',
    'docs/editions/owox-cloud-editions',
    'docs/getting-started/deployment-guide/render',
    'docs/getting-started/setup-guide/members-management/better-auth',
    'docs/storages/supported-storages/google-bigquery-used-in-owox-extension',
    'docs/connectors/manifest-reference',
    'packages/connectors/src/sources/tik-tok-ads/troubleshooting',
    'packages/connectors/contributing',
    'docs/project/contexts',
    'docs/notifications/webhooks',
    'docs/api',
    'docs/plugins/authoring-guide',
    'docs/changelog',
    'docs/contributing/testing',
    'licenses/mit',
    'apps/backend/readme',
  ]) {
    assert.equal(shouldShowCloudCta(id), false, id);
  }
});

test('treats index ids and trailing slashes like their section path', () => {
  assert.equal(shouldShowCloudCta('index'), true);
  assert.equal(shouldShowCloudCta('docs/reports/index'), true);
  assert.equal(shouldShowCloudCta('/docs/reports/'), true);
  assert.equal(shouldShowCloudCta('docs/api/index'), false);
});
