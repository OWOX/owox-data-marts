import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import * as matrixModule from './api-coverage-matrix.mjs';

const { parseCoverageMatrix, validateCoverageMatrix } = matrixModule;

const checkedInMatrix = fs.readFileSync(
  new URL('../../../docs/api/coverage.md', import.meta.url),
  'utf8'
);

const validMatrix = `# Support Matrix

## Summary

| API-key endpoints | Fully covered | OpenAPI covered | API client covered | Unassessed |
| ----------------: | ------------: | ---------------: | -----------------: | ---------: |
|                 3 |     1/3 (33%) |        2/3 (67%) |          1/3 (33%) |          1 |

## Data Marts

| Endpoint | OpenAPI | API client |
| --- | --- | --- |
| \`GET /api/data-marts/insight-templates\` | [Covered](https://app.owox.com/api/swagger-ui#/Insights/ProjectInsightTemplatesController_list) · 2026-07-01 | [Covered](./api-client/#list-project-insight-templates) · 2026-07-02 |
| \`GET /api/model-canvas/data-marts\` | [Covered](https://app.owox.com/api/swagger-ui#/Model%20Canvas/ModelCanvasController_getDataMarts) · 2026-07-03 | Gap |

## Project settings

| Endpoint | OpenAPI | API client |
| --- | --- | --- |
| \`GET /api/projects/settings\` | Unassessed | Unassessed |
`;

test('calculates totals from endpoint rows', () => {
  const matrix = parseCoverageMatrix(validMatrix);

  assert.equal(matrix.rows.length, 3);
  assert.deepEqual(matrix.totals, {
    endpoints: 3,
    fullyCovered: 1,
    openapiCovered: 2,
    clientCovered: 1,
    unassessed: 1,
  });
});

test('parses a linked covered cell into semantic status, date, and target', () => {
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
});

test('accepts a summary that matches calculated totals', () => {
  assert.deepEqual(validateCoverageMatrix(validMatrix), {
    endpoints: 3,
    fullyCovered: 1,
    openapiCovered: 2,
    clientCovered: 1,
    unassessed: 1,
  });
});

test('rejects summary drift', () => {
  const markdown = validMatrix.replace('1/3 (33%)', '2/3 (67%)');

  assert.throws(() => validateCoverageMatrix(markdown), /Fully covered summary/);
});

test('rejects duplicate endpoint rows', () => {
  const duplicateRow =
    '| `GET /api/data-marts/insight-templates` | [Covered](https://app.owox.com/api/swagger-ui#/Insights/ProjectInsightTemplatesController_list) · 2026-07-01 | [Covered](./api-client/#list-project-insight-templates) · 2026-07-02 |';
  const markdown = validMatrix.replace(
    '| `GET /api/model-canvas/data-marts` | [Covered](https://app.owox.com/api/swagger-ui#/Model%20Canvas/ModelCanvasController_getDataMarts) · 2026-07-03 | Gap |',
    duplicateRow
  );

  assert.throws(() => validateCoverageMatrix(markdown), /Duplicate endpoint/);
});

test('rejects unsupported statuses', () => {
  const markdown = validMatrix.replace(
    '[Covered](https://app.owox.com/api/swagger-ui#/Model%20Canvas/ModelCanvasController_getDataMarts) · 2026-07-03 | Gap',
    'Partial | Gap'
  );

  assert.throws(() => validateCoverageMatrix(markdown), /Unsupported OpenAPI status/);
});

test('rejects malformed covered dates', () => {
  assert.throws(
    () =>
      matrixModule.parseCoverageCell(
        '[Covered](https://app.owox.com/api/swagger-ui#/Model%20Canvas/ModelCanvasController_getDataMarts) · 2026-02-30',
        'OpenAPI',
        'GET /api/model-canvas/data-marts'
      ),
    /Invalid OpenAPI covered date/
  );
});

test('rejects an unlinked covered status', () => {
  assert.throws(
    () =>
      matrixModule.parseCoverageCell(
        'Covered · 2026-07-03',
        'OpenAPI',
        'GET /api/model-canvas/data-marts'
      ),
    /Unsupported OpenAPI status/
  );
});

test('rejects generic Swagger targets', () => {
  for (const target of [
    'https://app.owox.com/api/swagger-ui',
    'https://app.owox.com/api/swagger-ui#/Model%20Canvas',
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
});

test('rejects an API client target without a heading', () => {
  assert.throws(
    () =>
      matrixModule.parseCoverageCell(
        '[Covered](./api-client/) · 2026-07-02',
        'API client',
        'GET /api/data-marts/insight-templates'
      ),
    /Invalid API client target/
  );
});

test('rejects targets from the wrong coverage dimension', () => {
  assert.throws(
    () =>
      matrixModule.parseCoverageCell(
        '[Covered](./api-client/#read-the-models-canvas) · 2026-07-03',
        'OpenAPI',
        'GET /api/model-canvas/data-marts'
      ),
    /Invalid OpenAPI target/
  );
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

test('rejects stale endpoint-to-operation and endpoint-to-heading targets', () => {
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
});

test('rejects linked Gap and Unassessed values', () => {
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

test('rejects an empty endpoint inventory', () => {
  const markdown = validMatrix.replace(/^\| `(?:GET|POST) \/api\/.*\|$/gm, '');

  assert.throws(() => validateCoverageMatrix(markdown), /no endpoint rows/);
});

test('includes the API-key-compatible markdown parser endpoint', () => {
  const matrix = parseCoverageMatrix(
    checkedInMatrix.replace(/\[Covered\]\([^)]+\) · \d{4}-\d{2}-\d{2}/g, 'Unassessed')
  );

  assert.ok(matrix.rows.some(row => row.endpoint === 'POST /api/markdown/parse-to-html'));
});

test('checked-in matrix uses the public Support Matrix title', () => {
  assert.equal(checkedInMatrix.split('\n', 1)[0], '# Support Matrix');
});
