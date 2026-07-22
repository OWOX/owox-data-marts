import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENDPOINT_ROW_RE =
  /^\|\s*`((?:GET|POST|PUT|PATCH|DELETE)\s+[^`]+)`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/gm;
const COVERED_RE = /^\[Covered\]\(([^)]+)\) · (\d{4}-\d{2}-\d{2})$/;
const OPENAPI_TARGET_PREFIX = 'https://app.owox.com/api/swagger-ui#/';
const API_CLIENT_TARGET_RE = /^\.\/api-client\/#([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const SUMMARY_HEADER =
  '| API-key endpoints | Fully covered | OpenAPI covered | API client covered | Unassessed |';
const COVERAGE_EVIDENCE_TARGETS = {
  'GET /api/data-marts/insight-templates': {
    openapi: 'https://app.owox.com/api/swagger-ui#/Insights/ProjectInsightTemplatesController_list',
    client: './api-client/#list-project-insight-templates',
  },
  'GET /api/model-canvas/data-marts': {
    openapi:
      'https://app.owox.com/api/swagger-ui#/Model%20Canvas/ModelCanvasController_getDataMarts',
    client: './api-client/#read-the-models-canvas',
  },
  'GET /api/model-canvas/edges': {
    openapi: 'https://app.owox.com/api/swagger-ui#/Model%20Canvas/ModelCanvasController_getEdges',
    client: './api-client/#read-the-models-canvas',
  },
  'GET /api/projects/settings': {
    openapi:
      'https://app.owox.com/api/swagger-ui#/ProjectSettings/ProjectSettingsController_getSettings',
    client: './api-client/#manage-project-settings',
  },
  'PUT /api/projects/settings/description': {
    openapi:
      'https://app.owox.com/api/swagger-ui#/ProjectSettings/ProjectSettingsController_updateDescription',
    client: './api-client/#manage-project-settings',
  },
  'GET /api/data-marts/runs': {
    openapi:
      'https://app.owox.com/api/swagger-ui#/Run%20History/ProjectDataMartRunsController_list',
    client: './api-client/#read-project-run-history',
  },
  'GET /api/project-setup-progress': {
    openapi:
      'https://app.owox.com/api/swagger-ui#/project-setup-progress/ProjectSetupProgressController_getProgress',
    client: './api-client/#check-project-setup-progress',
  },
  'POST /api/markdown/parse-to-html': {
    openapi: 'https://app.owox.com/api/swagger-ui#/Utils/MarkdownParserController_parseToHtml',
    client: './api-client/#convert-markdown-to-html',
  },
};

function assertPageTitle(markdown) {
  const title = markdown.match(/^# .+$/m)?.[0];
  if (title !== '# Support Matrix') {
    throw new Error('API coverage page title must be Support Matrix');
  }
}

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

function parseEndpointRows(markdown, coverageEvidenceTargets) {
  return [...markdown.matchAll(ENDPOINT_ROW_RE)].map(match => {
    const endpoint = match[1].trim();
    return {
      endpoint,
      openapi: parseCoverageCell(match[2].trim(), 'OpenAPI', endpoint, coverageEvidenceTargets),
      client: parseCoverageCell(match[3].trim(), 'API client', endpoint, coverageEvidenceTargets),
    };
  });
}

function isCovered(coverage) {
  return coverage.status === 'Covered';
}

function headingSlug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function parseApiClientGuideTargets(markdown) {
  return new Set(
    [...markdown.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map(
      match => `./api-client/#${headingSlug(match[1])}`
    )
  );
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

function assertOpenApiTarget(target, endpoint) {
  if (!target.startsWith(OPENAPI_TARGET_PREFIX)) {
    throw new Error(
      `Invalid OpenAPI target for ${endpoint}: ${target}; ` +
        'coverage must link to an operation-level Swagger UI target'
    );
  }

  const fragment = target.slice(OPENAPI_TARGET_PREFIX.length);
  const parts = fragment.split('/');
  if (
    parts.length !== 2 ||
    !/^[A-Za-z0-9._~%-]+$/.test(parts[0]) ||
    !/^[A-Za-z0-9._~-]+$/.test(parts[1])
  ) {
    throw new Error(
      `Invalid OpenAPI target for ${endpoint}: ${target}; ` +
        'coverage must link to an operation-level Swagger UI target'
    );
  }
}

function assertApiClientTarget(target, endpoint) {
  if (!API_CLIENT_TARGET_RE.test(target)) {
    throw new Error(
      `Invalid API client target for ${endpoint}: ${target}; ` +
        'coverage must link to an API-client guide heading'
    );
  }
}

export function parseCoverageCell(
  value,
  dimension,
  endpoint,
  coverageEvidenceTargets = COVERAGE_EVIDENCE_TARGETS
) {
  if (value === 'Gap' || value === 'Unassessed') {
    return { status: value, coveredSince: null, target: null };
  }

  const covered = COVERED_RE.exec(value);
  if (!covered) {
    throw new Error(`Unsupported ${dimension} status for ${endpoint}: ${value}`);
  }
  const [, target, coveredSince] = covered;
  if (!isValidDate(coveredSince)) {
    throw new Error(`Invalid ${dimension} covered date for ${endpoint}: ${coveredSince}`);
  }

  if (dimension === 'OpenAPI') {
    assertOpenApiTarget(target, endpoint);
  } else if (dimension === 'API client') {
    assertApiClientTarget(target, endpoint);
  } else {
    throw new Error(`Unsupported coverage dimension: ${dimension}`);
  }

  const evidenceKey = dimension === 'OpenAPI' ? 'openapi' : 'client';
  const expectedTarget = coverageEvidenceTargets[endpoint]?.[evidenceKey];
  if (target !== expectedTarget) {
    const evidenceDescription =
      dimension === 'OpenAPI'
        ? 'exact audited Swagger operation'
        : 'exact audited API-client capability heading';
    throw new Error(
      `Incorrect ${dimension} target for ${endpoint}: expected ${expectedTarget ?? 'no target'}, ` +
        `received ${target}; coverage must link to the ${evidenceDescription}`
    );
  }

  return { status: 'Covered', coveredSince, target };
}

function assertApiClientGuideTargets(rows, apiClientGuideMarkdown) {
  const apiClientGuideTargets = parseApiClientGuideTargets(apiClientGuideMarkdown);
  for (const row of rows) {
    if (row.client.status === 'Covered' && !apiClientGuideTargets.has(row.client.target)) {
      throw new Error(
        `API client coverage for ${row.endpoint} links to a missing public API-client guide heading`
      );
    }
  }
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

export function parseCoverageMatrix(markdown, coverageEvidenceTargets = COVERAGE_EVIDENCE_TARGETS) {
  const rows = parseEndpointRows(markdown, coverageEvidenceTargets);
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

export function validateCoverageMatrix(
  markdown,
  apiClientGuideMarkdown,
  coverageEvidenceTargets = COVERAGE_EVIDENCE_TARGETS
) {
  assertPageTitle(markdown);
  if (typeof apiClientGuideMarkdown !== 'string') {
    throw new Error('API-client guide Markdown is required to validate coverage links');
  }
  const matrix = parseCoverageMatrix(markdown, coverageEvidenceTargets);
  assertUniqueEndpoints(matrix.rows);
  assertApiClientGuideTargets(matrix.rows, apiClientGuideMarkdown);
  assertSummaryMatches(matrix.summary, matrix.totals);
  return matrix.totals;
}

const isDirectInvocation =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectInvocation) {
  const coveragePath = fileURLToPath(new URL('../../../docs/api/coverage.md', import.meta.url));
  const apiClientGuidePath = fileURLToPath(
    new URL('../../../docs/api/api-client.md', import.meta.url)
  );
  const totals = validateCoverageMatrix(
    fs.readFileSync(coveragePath, 'utf8'),
    fs.readFileSync(apiClientGuidePath, 'utf8')
  );
  console.log(
    `API coverage matrix valid: ${totals.endpoints} endpoints, ` +
      `${totals.fullyCovered} fully covered`
  );
}
