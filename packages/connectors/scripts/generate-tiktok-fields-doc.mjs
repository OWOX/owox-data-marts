/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * Generates ENDPOINTS_AND_FIELDS.md for the TikTok Ads source from the connector's own
 * schema files, so the published field tables cannot drift from the code.
 *
 * Field names, types, and descriptions come from TikTokAdsAPIReference/*Fields.js.
 * Unique keys come from TikTokAdsSource.getUniqueKeysForNode(), the same method the
 * connector uses to validate and merge rows — not a hand-copied list.
 *
 * Usage: node scripts/generate-tiktok-fields-doc.mjs [--check]
 *   --check  exit 1 if the file on disk differs, instead of writing it (for CI)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadGasClass } from '../test/support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '../src');
const TIKTOK = path.join(SRC, 'Sources/TikTokAds');
const API_REF = path.join(TIKTOK, 'TikTokAdsAPIReference');
const OUT_FILE = path.join(TIKTOK, 'ENDPOINTS_AND_FIELDS.md');

const INSIGHTS_NODES = ['ad_insights', 'ad_insights_by_country'];

// Catalog nodes first, then performance nodes, matching the order the
// "Which endpoint should I choose?" guidance walks the reader through.
const NODE_ORDER = [
  'advertiser',
  'campaigns',
  'ad_groups',
  'ads',
  'audiences',
  'ad_insights',
  'ad_insights_by_country',
];

/**
 * Loads the GAS-style schema files into this realm. Order matters: DATA_TYPES and the
 * per-node field objects must exist before TikTokAdsFieldsSchema.js references them,
 * and AbstractSource must exist before Source.js extends it.
 *
 * @return {{schema: object, source: object, dataLevels: string[]}}
 */
function loadSchema() {
  loadGasClass(path.join(SRC, 'Constants/DataTypes.js'));

  for (const file of fs.readdirSync(API_REF).filter(f => f.endsWith('Fields.js'))) {
    loadGasClass(path.join(API_REF, file));
  }
  loadGasClass(path.join(API_REF, 'TikTokAdsFieldsSchema.js'));

  loadGasClass(path.join(SRC, 'Core/AbstractSource.js'));
  loadGasClass(path.join(TIKTOK, 'Source.js'));

  const schema = globalThis.TikTokAdsFieldsSchema;

  // Object.create rather than `new`: the constructor needs a live config object we do
  // not have here, but every method we call reads only `this.fieldsSchema`.
  const source = Object.create(globalThis.TikTokAdsSource.prototype);
  source.fieldsSchema = schema;

  return { schema, source, dataLevels: globalThis.TIKTOK_ADS_DATA_LEVELS };
}

/**
 * Maps each field of a node to the "Required" cell it gets in the field table.
 *
 * Catalog nodes have one fixed unique key set. Insights nodes have a different set per
 * Data Level, so a field can be required at some levels and optional at others.
 *
 * @param {string} nodeName
 * @param {object} ctx - the loaded schema context
 * @return {Map<string, string>} field name -> Required cell text
 */
function buildRequiredMap(nodeName, { schema, source, dataLevels }) {
  const required = new Map();

  if (!INSIGHTS_NODES.includes(nodeName)) {
    for (const key of schema[nodeName].uniqueKeys ?? []) {
      required.set(key, 'Yes (unique key)');
    }
    return required;
  }

  const levelsByField = new Map();
  for (const level of dataLevels) {
    for (const key of source.getUniqueKeysForNode(nodeName, level)) {
      if (!levelsByField.has(key)) levelsByField.set(key, []);
      levelsByField.get(key).push(level);
    }
  }

  for (const [field, levels] of levelsByField) {
    required.set(
      field,
      levels.length === dataLevels.length
        ? 'Yes (unique key)'
        : `Yes at ${levels.map(l => `\`${l}\``).join(', ')}`
    );
  }
  return required;
}

/** Escapes pipes so a description can never break out of its table cell. */
const cell = text =>
  String(text ?? '')
    .replace(/\|/g, '\\|')
    .trim();

/**
 * @param {string} nodeName
 * @param {object} ctx
 * @return {string} the `###` section for one endpoint
 */
function renderNode(nodeName, ctx) {
  const node = ctx.schema[nodeName];
  const fields = node.fields;
  const required = buildRequiredMap(nodeName, ctx);

  const lines = [
    `### ${node.title} (\`${nodeName}\`)`,
    '',
    node.description,
    '',
    `Official TikTok reference: [${node.title}](${node.documentation})`,
    '',
    `Destination table: \`${node.destinationName}\``,
  ];

  if (INSIGHTS_NODES.includes(nodeName)) {
    lines.push('', 'Unique keys depend on **Data Level**:', '');
    lines.push('| Data Level | Unique keys |', '| --- | --- |');
    for (const level of ctx.dataLevels) {
      const keys = ctx.source.getUniqueKeysForNode(nodeName, level);
      lines.push(`| \`${level}\` | ${keys.map(k => `\`${k}\``).join(', ')} |`);
    }
  } else {
    lines.push('', `Unique keys: ${node.uniqueKeys.map(k => `\`${k}\``).join(', ')}`);
  }

  const partitioned = Object.keys(fields).filter(f => fields[f].GoogleBigQueryPartitioned);
  if (partitioned.length) {
    lines.push('', `BigQuery partition field: ${partitioned.map(f => `\`${f}\``).join(', ')}`);
  }

  lines.push(
    '',
    `Fields: ${Object.keys(fields).length}. Selected by default: ${node.defaultFields
      .map(f => `\`${f}\``)
      .join(', ')}.`,
    '',
    '| Connector field | Data type | Required | Description |',
    '| --- | --- | --- | --- |'
  );

  for (const [name, field] of Object.entries(fields)) {
    lines.push(
      `| \`${name}\` | \`${field.type}\` | ${required.get(name) ?? 'No'} | ${cell(field.description)} |`
    );
  }

  return lines.join('\n');
}

/**
 * @param {object} ctx
 * @return {string} the complete Markdown document
 */
function renderDoc(ctx) {
  const { schema, source, dataLevels } = ctx;
  const nodes = NODE_ORDER.filter(n => schema[n]);

  const overview = nodes.map(name => {
    const node = schema[name];
    const keys = INSIGHTS_NODES.includes(name)
      ? 'Varies by Data Level'
      : node.uniqueKeys.map(k => `\`${k}\``).join(', ');
    return `| **${node.title}** (\`${name}\`) | ${cell(node.description)} | ${Object.keys(node.fields).length} | ${keys} | \`${node.destinationName}\` |`;
  });

  const dataLevelRows = dataLevels.map(level => {
    const cells = INSIGHTS_NODES.map(n =>
      source
        .getUniqueKeysForNode(n, level)
        .map(k => `\`${k}\``)
        .join(', ')
    );
    return `| \`${level}\` | ${cells.join(' | ')} |`;
  });

  return `<!-- Generated by scripts/generate-tiktok-fields-doc.mjs. Do not edit by hand. -->

# TikTok Ads Supported Endpoints and Fields

This page lists the TikTok Ads endpoints and fields in the connector. Use it to choose an
endpoint and fields. Each endpoint lists its destination table, unique keys, and TikTok
reference. The connector requests TikTok Business API version \`v1.3\`.

## Which Endpoint Should I Choose?

- For performance reporting such as spend, impressions, clicks, and conversions, start with **Ad Performance**.
- For performance split by country, use **Ad Performance by Country**.
- For advertiser account settings, name, and currency, use **Advertiser Account**.
- For campaign objectives, budgets, and schedules, use **Campaigns**.
- For bid strategy, optimization goal, placement, and targeting, use **Ad Groups**.
- For ad names, formats, statuses, and their campaign links, use **Ads**.
- For custom audience type, size, and expiration, use **Custom Audiences**.

## Supported Endpoints

| Endpoint | Use it for | Fields | Unique keys | Destination table |
| --- | --- | ---: | --- | --- |
${overview.join('\n')}

## Data Level and Unique Keys

**Data Level** sets the reporting grain for the two performance endpoints. Choose it before
you select fields. The field selector pins the matching unique-key fields, so rows merge correctly.

| Data Level | \`ad_insights\` unique keys | \`ad_insights_by_country\` unique keys |
| --- | --- | --- |
${dataLevelRows.join('\n')}

\`advertiser_id\` is always a unique key. **Advertiser IDs** can list several advertisers
that write into one destination table. At \`AUCTION_ADVERTISER\` no other field tells their
rows apart.

> ⚠️ Do not change **Data Level** after a run has loaded data into a table. New rows would
> merge on a different key structure. Use a new Data Mart or a new destination table instead.

## Field Table Notes

- **Connector field**: the field name in OWOX Data Marts. The connector writes it to the destination table.
- **Data type**: the type the connector uses in the destination schema.
- **Required**: \`Yes (unique key)\` means the connector always requests the field, and the
  selector pins it. On performance endpoints, some fields are required only at certain Data Levels.
- Fields marked **Required** cannot be removed. A run fails with
  \`Missing required unique fields\` if one is missing.

## Endpoint Fields

${nodes.map(name => renderNode(name, ctx)).join('\n\n')}
`;
}

const ctx = loadSchema();
const doc = renderDoc(ctx);

if (process.argv.includes('--check')) {
  const current = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8') : '';
  if (current !== doc) {
    console.error(
      `${path.relative(process.cwd(), OUT_FILE)} is out of date. Run: node scripts/generate-tiktok-fields-doc.mjs`
    );
    process.exit(1);
  }
  console.log('ENDPOINTS_AND_FIELDS.md is up to date.');
} else {
  fs.writeFileSync(OUT_FILE, doc);
  console.log(`Wrote ${path.relative(process.cwd(), OUT_FILE)}`);
}
