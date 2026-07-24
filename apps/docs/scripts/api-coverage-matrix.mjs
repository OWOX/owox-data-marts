import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENDPOINT_ROW_RE =
  /^\|\s*`((?:GET|POST|PUT|PATCH|DELETE)\s+[^`]+)`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/gm;
const LINKED_COVERED_RE = /^\[Covered\]\(([^)]+)\) · (\d{4}-\d{2}-\d{2})$/;
const SUMMARY_HEADER =
  '| API-key endpoints | Fully covered | OpenAPI covered | API client covered | Unassessed |';
const COVERED_TARGETS = new Map([
  [
    'GET /api/auth/context',
    {
      OpenAPI:
        'https://app.owox.com/api/swagger-ui#/Authentication/AuthContextController_getContext',
      'API client': './api-client/#get-auth-context',
    },
  ],
  [
    'GET /api/data-marts/insight-templates',
    {
      OpenAPI:
        'https://app.owox.com/api/swagger-ui#/Insights/ProjectInsightTemplatesController_list',
      'API client': './api-client/#list-project-insight-templates',
    },
  ],
  [
    'GET /api/data-marts',
    {
      OpenAPI: 'https://app.owox.com/api/swagger-ui#/DataMarts/DataMartController_list',
      'API client': './api-client/#list-data-marts',
    },
  ],
  [
    'GET /api/external/http-data/data-marts/{dataMartId}.ndjson',
    {
      OpenAPI: 'https://app.owox.com/api/swagger-ui#/HTTP%20Data/HttpDataController_stream',
      'API client': './api-client/#stream-data-mart-rows',
    },
  ],
  [
    'GET /api/model-canvas/data-marts',
    {
      OpenAPI:
        'https://app.owox.com/api/swagger-ui#/Model%20Canvas/ModelCanvasController_getDataMarts',
      'API client': './api-client/#read-the-models-canvas',
    },
  ],
  [
    'GET /api/model-canvas/edges',
    {
      OpenAPI: 'https://app.owox.com/api/swagger-ui#/Model%20Canvas/ModelCanvasController_getEdges',
      'API client': './api-client/#read-the-models-canvas',
    },
  ],
  [
    'GET /api/projects/settings',
    {
      OpenAPI:
        'https://app.owox.com/api/swagger-ui#/ProjectSettings/ProjectSettingsController_getSettings',
      'API client': './api-client/#manage-project-settings',
    },
  ],
  [
    'PUT /api/projects/settings/description',
    {
      OpenAPI:
        'https://app.owox.com/api/swagger-ui#/ProjectSettings/ProjectSettingsController_updateDescription',
      'API client': './api-client/#manage-project-settings',
    },
  ],
  [
    'GET /api/data-marts/runs',
    {
      OpenAPI:
        'https://app.owox.com/api/swagger-ui#/Run%20History/ProjectDataMartRunsController_list',
      'API client': './api-client/#read-project-run-history',
    },
  ],
  [
    'GET /api/project-setup-progress',
    {
      OpenAPI:
        'https://app.owox.com/api/swagger-ui#/project-setup-progress/ProjectSetupProgressController_getProgress',
      'API client': './api-client/#check-project-setup-progress',
    },
  ],
  [
    'POST /api/markdown/parse-to-html',
    {
      OpenAPI: 'https://app.owox.com/api/swagger-ui#/Utils/MarkdownParserController_parseToHtml',
      'API client': './api-client/#convert-markdown-to-html',
    },
  ],
  [
    'GET /api/search',
    {
      OpenAPI: 'https://app.owox.com/api/swagger-ui#/Search/SearchController_search',
      'API client': './api-client/#search-project-entities',
    },
  ],
]);

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim());
}

function parseInteger(value, label) {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${label} must be an integer`);
  }
  return Number(value);
}

function parseCoverageTotal(value, label) {
  const match = /^(\d+)\/(\d+) \((\d+)%\)$/.exec(value);
  if (!match) {
    throw new Error(`${label} summary must use covered/total (percentage%)`);
  }

  return {
    covered: Number(match[1]),
    total: Number(match[2]),
    percentage: Number(match[3]),
  };
}

function parseSummary(markdown) {
  const lines = markdown.split(/\r?\n/);
  const headerIndex = lines.findIndex(line => line.trim() === SUMMARY_HEADER);
  if (headerIndex === -1) {
    throw new Error('API coverage matrix summary header is missing');
  }

  const values = splitTableRow(lines[headerIndex + 2] ?? '');
  if (values.length !== 5) {
    throw new Error('API coverage matrix summary row is missing');
  }

  return {
    endpoints: parseInteger(values[0], 'API-key endpoints summary'),
    fullyCovered: parseCoverageTotal(values[1], 'Fully covered'),
    openapiCovered: parseCoverageTotal(values[2], 'OpenAPI covered'),
    clientCovered: parseCoverageTotal(values[3], 'API client covered'),
    unassessed: parseInteger(values[4], 'Unassessed summary'),
  };
}

function assertUniqueEndpoints(rows) {
  const endpoints = new Set();
  for (const row of rows) {
    if (endpoints.has(row.endpoint)) {
      throw new Error(`Duplicate endpoint: ${row.endpoint}`);
    }
    endpoints.add(row.endpoint);
  }
}

function isValidDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10) === value;
}

function assertValidOpenApiTarget(target, endpoint) {
  let url;
  try {
    url = new URL(target);
  } catch {
    throw new Error(`Invalid OpenAPI target for ${endpoint}: ${target}`);
  }

  let fragmentParts;
  try {
    fragmentParts = decodeURIComponent(url.hash).split('/');
  } catch {
    throw new Error(`Invalid OpenAPI target for ${endpoint}: ${target}`);
  }

  if (
    url.protocol !== 'https:' ||
    url.origin !== 'https://app.owox.com' ||
    url.pathname !== '/api/swagger-ui' ||
    url.search !== '' ||
    fragmentParts.length !== 3 ||
    fragmentParts[0] !== '#' ||
    fragmentParts[1] === '' ||
    fragmentParts[2] === ''
  ) {
    throw new Error(`Invalid OpenAPI target for ${endpoint}: ${target}`);
  }
}

function assertValidApiClientTarget(target, endpoint) {
  if (!/^\.\/api-client\/#\S+$/.test(target)) {
    throw new Error(`Invalid API client target for ${endpoint}: ${target}`);
  }
}

export function parseCoverageCell(value, dimension, endpoint) {
  if (value === 'Gap' || value === 'Unassessed') {
    return { status: value, coveredSince: null, target: null };
  }

  const covered = LINKED_COVERED_RE.exec(value);
  if (!covered) {
    throw new Error(`Unsupported ${dimension} status for ${endpoint}: ${value}`);
  }

  const [, target, coveredSince] = covered;
  if (!isValidDate(coveredSince)) {
    throw new Error(`Invalid ${dimension} covered date for ${endpoint}: ${coveredSince}`);
  }

  if (dimension === 'OpenAPI') {
    assertValidOpenApiTarget(target, endpoint);
  } else if (dimension === 'API client') {
    assertValidApiClientTarget(target, endpoint);
  } else {
    throw new Error(`Unsupported coverage dimension: ${dimension}`);
  }

  const expectedTarget = COVERED_TARGETS.get(endpoint)?.[dimension];
  if (target !== expectedTarget) {
    throw new Error(
      `Incorrect ${dimension} target for ${endpoint}: expected ${expectedTarget ?? 'no target'}, ` +
        `received ${target}`
    );
  }

  return { status: 'Covered', coveredSince, target };
}

function parseEndpointRows(markdown) {
  return [...markdown.matchAll(ENDPOINT_ROW_RE)].map(match => {
    const endpoint = match[1].trim();
    return {
      endpoint,
      openapi: parseCoverageCell(match[2].trim(), 'OpenAPI', endpoint),
      client: parseCoverageCell(match[3].trim(), 'API client', endpoint),
    };
  });
}

function isCovered(coverage) {
  return coverage.status === 'Covered';
}

function percentage(covered, total) {
  return Math.round((covered / total) * 100);
}

function assertCoverageSummary(label, actual, covered, total) {
  const expectedPercentage = percentage(covered, total);
  if (
    actual.covered !== covered ||
    actual.total !== total ||
    actual.percentage !== expectedPercentage
  ) {
    throw new Error(
      `${label} summary must be ${covered}/${total} (${expectedPercentage}%), ` +
        `received ${actual.covered}/${actual.total} (${actual.percentage}%)`
    );
  }
}

function assertSummaryMatches(summary, totals) {
  if (summary.endpoints !== totals.endpoints) {
    throw new Error(
      `API-key endpoints summary must be ${totals.endpoints}, received ${summary.endpoints}`
    );
  }

  assertCoverageSummary(
    'Fully covered',
    summary.fullyCovered,
    totals.fullyCovered,
    totals.endpoints
  );
  assertCoverageSummary(
    'OpenAPI covered',
    summary.openapiCovered,
    totals.openapiCovered,
    totals.endpoints
  );
  assertCoverageSummary(
    'API client covered',
    summary.clientCovered,
    totals.clientCovered,
    totals.endpoints
  );

  if (summary.unassessed !== totals.unassessed) {
    throw new Error(
      `Unassessed summary must be ${totals.unassessed}, received ${summary.unassessed}`
    );
  }
}

export function parseCoverageMatrix(markdown) {
  const rows = parseEndpointRows(markdown);
  if (rows.length === 0) {
    throw new Error('API coverage matrix has no endpoint rows');
  }

  const totals = {
    endpoints: rows.length,
    fullyCovered: rows.filter(row => isCovered(row.openapi) && isCovered(row.client)).length,
    openapiCovered: rows.filter(row => isCovered(row.openapi)).length,
    clientCovered: rows.filter(row => isCovered(row.client)).length,
    unassessed: rows.filter(
      row => row.openapi.status === 'Unassessed' || row.client.status === 'Unassessed'
    ).length,
  };

  return { rows, totals, summary: parseSummary(markdown) };
}

export function validateCoverageMatrix(markdown) {
  const matrix = parseCoverageMatrix(markdown);
  assertUniqueEndpoints(matrix.rows);
  assertSummaryMatches(matrix.summary, matrix.totals);
  return matrix.totals;
}

const isDirectInvocation =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectInvocation) {
  const coveragePath = fileURLToPath(new URL('../../../docs/api/coverage.md', import.meta.url));
  const totals = validateCoverageMatrix(fs.readFileSync(coveragePath, 'utf8'));
  console.log(
    `API coverage matrix valid: ${totals.endpoints} endpoints, ` +
      `${totals.fullyCovered} fully covered`
  );
}
