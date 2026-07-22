import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import * as matrixModule from './api-coverage-matrix.mjs';

const { parseCoverageMatrix, validateCoverageMatrix } = matrixModule;

const checkedInMatrix = fs.readFileSync(
  new URL('../../../docs/api/coverage.md', import.meta.url),
  'utf8'
);

const validApiClientGuide = `# API Client

## List data marts
`;

const validEvidenceTargets = {
  'GET /api/data-marts': {
    openapi: 'https://app.owox.com/api/swagger-ui#/DataMarts/DataMartController_list',
    client: './api-client/#list-data-marts',
  },
  'POST /api/data-marts': {
    openapi: 'https://app.owox.com/api/swagger-ui#/DataMarts/DataMartController_create',
  },
};

const validMatrix = `# Support Matrix

## Summary

| API-key endpoints | Fully covered | OpenAPI covered | API client covered | Unassessed |
| ----------------: | ------------: | ---------------: | -----------------: | ---------: |
|                 3 |     1/3 (33%) |        2/3 (67%) |          1/3 (33%) |          1 |

## Data Marts

| Endpoint | OpenAPI | API client |
| --- | --- | --- |
| \`GET /api/data-marts\` | [Covered](https://app.owox.com/api/swagger-ui#/DataMarts/DataMartController_list) · 2026-07-01 | [Covered](./api-client/#list-data-marts) · 2026-07-02 |
| \`POST /api/data-marts\` | [Covered](https://app.owox.com/api/swagger-ui#/DataMarts/DataMartController_create) · 2026-07-03 | Gap |

## Project settings

| Endpoint | OpenAPI | API client |
| --- | --- | --- |
| \`GET /api/projects/settings\` | Unassessed | Unassessed |
`;

function validate(markdown, evidenceTargets = validEvidenceTargets) {
  return validateCoverageMatrix(markdown, validApiClientGuide, evidenceTargets);
}

test('calculates totals from endpoint rows', () => {
  const matrix = parseCoverageMatrix(validMatrix, validEvidenceTargets);

  assert.equal(matrix.rows.length, 3);
  assert.deepEqual(matrix.rows[0].openapi, {
    status: 'Covered',
    coveredSince: '2026-07-01',
    target: 'https://app.owox.com/api/swagger-ui#/DataMarts/DataMartController_list',
  });
  assert.deepEqual(matrix.totals, {
    endpoints: 3,
    fullyCovered: 1,
    openapiCovered: 2,
    clientCovered: 1,
    unassessed: 1,
  });
});

test('exports the semantic coverage-cell parser from current main', () => {
  assert.deepEqual(
    matrixModule.parseCoverageCell(
      '[Covered](https://app.owox.com/api/swagger-ui#/Insights/ProjectInsightTemplatesController_list) · 2026-07-01',
      'OpenAPI',
      'GET /api/data-marts/insight-templates'
    ),
    {
      status: 'Covered',
      coveredSince: '2026-07-01',
      target:
        'https://app.owox.com/api/swagger-ui#/Insights/ProjectInsightTemplatesController_list',
    }
  );
  assert.deepEqual(
    matrixModule.parseCoverageCell('Gap', 'API client', 'GET /api/model-canvas/data-marts'),
    { status: 'Gap', coveredSince: null, target: null }
  );
  assert.deepEqual(
    matrixModule.parseCoverageCell('Unassessed', 'OpenAPI', 'GET /api/projects/settings'),
    { status: 'Unassessed', coveredSince: null, target: null }
  );
});

test('semantic coverage-cell parser rejects generic and wrong-dimension targets', () => {
  for (const target of [
    'https://app.owox.com/api/swagger-ui',
    'https://app.owox.com/api/swagger-ui#/Model%20Canvas',
    './api-client/#read-the-models-canvas',
  ]) {
    assert.throws(
      () =>
        matrixModule.parseCoverageCell(
          `[Covered](${target}) · 2026-07-03`,
          'OpenAPI',
          'GET /api/model-canvas/data-marts'
        ),
      /Invalid OpenAPI target/
    );
  }

  assert.throws(
    () =>
      matrixModule.parseCoverageCell(
        '[Covered](https://app.owox.com/api/swagger-ui#/Insights/ProjectInsightTemplatesController_list) · 2026-07-02',
        'API client',
        'GET /api/data-marts/insight-templates'
      ),
    /Invalid API client target/
  );
});

test('semantic coverage-cell parser rejects stale audited targets and linked non-covered values', () => {
  assert.throws(
    () =>
      matrixModule.parseCoverageCell(
        '[Covered](https://app.owox.com/api/swagger-ui#/Run%20History/ProjectDataMartRunsController_list) · 2026-07-01',
        'OpenAPI',
        'GET /api/data-marts/insight-templates'
      ),
    /Incorrect OpenAPI target/
  );
  assert.throws(
    () =>
      matrixModule.parseCoverageCell(
        '[Covered](./api-client/#read-project-run-history) · 2026-07-02',
        'API client',
        'GET /api/data-marts/insight-templates'
      ),
    /Incorrect API client target/
  );
  assert.throws(
    () =>
      matrixModule.parseCoverageCell(
        '[Gap](./api-client/#read-the-models-canvas)',
        'API client',
        'GET /api/model-canvas/data-marts'
      ),
    /Unsupported API client status/
  );
  assert.throws(
    () =>
      matrixModule.parseCoverageCell(
        '[Unassessed](https://app.owox.com/api/swagger-ui#/ProjectSettings/ProjectSettingsController_getSettings)',
        'OpenAPI',
        'GET /api/projects/settings'
      ),
    /Unsupported OpenAPI status/
  );
});

test('accepts a summary that matches calculated totals', () => {
  assert.deepEqual(validate(validMatrix), {
    endpoints: 3,
    fullyCovered: 1,
    openapiCovered: 2,
    clientCovered: 1,
    unassessed: 1,
  });
});

test('rejects summary drift', () => {
  const markdown = validMatrix.replace('1/3 (33%)', '2/3 (67%)');

  assert.throws(() => validate(markdown), /Fully covered summary/);
});

test('rejects duplicate endpoint rows', () => {
  const duplicateRow =
    '| `GET /api/data-marts` | [Covered](https://app.owox.com/api/swagger-ui#/DataMarts/DataMartController_list) · 2026-07-01 | [Covered](./api-client/#list-data-marts) · 2026-07-02 |';
  const markdown = validMatrix.replace(
    '| `POST /api/data-marts` | [Covered](https://app.owox.com/api/swagger-ui#/DataMarts/DataMartController_create) · 2026-07-03 | Gap |',
    duplicateRow
  );

  assert.throws(() => validate(markdown), /Duplicate endpoint/);
});

test('rejects unsupported statuses', () => {
  const markdown = validMatrix.replace(
    '[Covered](https://app.owox.com/api/swagger-ui#/DataMarts/DataMartController_create) · 2026-07-03 | Gap',
    'Partial | Gap'
  );

  assert.throws(() => validate(markdown), /Unsupported OpenAPI status/);
});

test('rejects malformed covered dates', () => {
  const markdown = validMatrix.replace('2026-07-03', '2026-02-30');

  assert.throws(() => validate(markdown), /Invalid OpenAPI covered date/);
});

test('rejects an empty endpoint inventory', () => {
  const markdown = validMatrix.replace(/^\| `(?:GET|POST) \/api\/.*\|$/gm, '');

  assert.throws(() => validate(markdown), /no endpoint rows/);
});

test('requires the exact public page title', () => {
  const markdown = validMatrix.replace('# Support Matrix', '# API Support Matrix');

  assert.throws(() => validate(markdown), /page title must be Support Matrix/);
});

test('rejects a plain Covered cell without an evidence link', () => {
  const markdown = validMatrix.replace(
    '[Covered](https://app.owox.com/api/swagger-ui#/DataMarts/DataMartController_create) · 2026-07-03',
    'Covered · 2026-07-03'
  );

  assert.throws(() => validate(markdown), /Unsupported OpenAPI status/);
});

test('rejects a tag-only Swagger target', () => {
  const markdown = validMatrix.replace(
    'https://app.owox.com/api/swagger-ui#/DataMarts/DataMartController_create',
    'https://app.owox.com/api/swagger-ui#/DataMarts'
  );

  assert.throws(() => validate(markdown), /operation-level Swagger UI target/);
});

test('rejects a stale Swagger operation target', () => {
  const markdown = validMatrix.replace(
    'DataMartController_create',
    'DataMartController_removedOperation'
  );

  assert.throws(() => validate(markdown), /exact audited Swagger operation/);
});

test('rejects a wrong-dimension target', () => {
  const markdown = validMatrix.replace(
    './api-client/#list-data-marts',
    'https://app.owox.com/api/swagger-ui#/DataMarts/DataMartController_list'
  );

  assert.throws(() => validate(markdown), /API-client guide heading/);
});

test('rejects an API-client target whose heading is absent from the public guide', () => {
  const markdown = validMatrix.replace('./api-client/#list-data-marts', './api-client/#missing');
  const evidenceTargets = structuredClone(validEvidenceTargets);
  evidenceTargets['GET /api/data-marts'].client = './api-client/#missing';

  assert.throws(
    () => validate(markdown, evidenceTargets),
    /missing public API-client guide heading/
  );
});

test('rejects a generic API-client guide heading', () => {
  const markdown = validMatrix.replace('./api-client/#list-data-marts', './api-client/#api-client');

  assert.throws(() => validate(markdown), /exact audited API-client capability heading/);
});

test('includes the API-key-compatible markdown parser endpoint', () => {
  const matrix = parseCoverageMatrix(checkedInMatrix);

  assert.ok(matrix.rows.some(row => row.endpoint === 'POST /api/markdown/parse-to-html'));
});

test('uses the exact audited evidence targets for every covered endpoint', () => {
  const matrix = parseCoverageMatrix(checkedInMatrix);
  const expectedTargets = {
    'GET /api/data-marts/insight-templates': {
      openapi:
        'https://app.owox.com/api/swagger-ui#/Insights/ProjectInsightTemplatesController_list',
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

  const coveredRows = matrix.rows.filter(
    row => row.openapi.status === 'Covered' || row.client.status === 'Covered'
  );
  assert.equal(coveredRows.length, Object.keys(expectedTargets).length);

  for (const row of coveredRows) {
    const expected = expectedTargets[row.endpoint];
    assert.ok(expected, `Unexpected covered endpoint: ${row.endpoint}`);
    assert.equal(row.openapi.target, expected.openapi);
    assert.equal(row.client.target, expected.client);
  }
});
