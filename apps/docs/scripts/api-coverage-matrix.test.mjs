import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { parseCoverageMatrix, validateCoverageMatrix } from './api-coverage-matrix.mjs';

const checkedInMatrix = fs.readFileSync(
  new URL('../../../docs/api/coverage.md', import.meta.url),
  'utf8'
);

const validMatrix = `# API Support Matrix

## Summary

| API-key endpoints | Fully covered | OpenAPI covered | API client covered | Unassessed |
| ----------------: | ------------: | ---------------: | -----------------: | ---------: |
|                 3 |     1/3 (33%) |        2/3 (67%) |          1/3 (33%) |          1 |

## Data Marts

| Endpoint | OpenAPI | API client |
| --- | --- | --- |
| \`GET /api/data-marts\` | Covered · 2026-07-01 | Covered · 2026-07-02 |
| \`POST /api/data-marts\` | Covered · 2026-07-03 | Gap |

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
  const duplicateRow = '| `GET /api/data-marts` | Covered · 2026-07-01 | Covered · 2026-07-02 |';
  const markdown = validMatrix.replace(
    '| `POST /api/data-marts` | Covered · 2026-07-03 | Gap |',
    duplicateRow
  );

  assert.throws(() => validateCoverageMatrix(markdown), /Duplicate endpoint/);
});

test('rejects unsupported statuses', () => {
  const markdown = validMatrix.replace('Covered · 2026-07-03 | Gap', 'Partial | Gap');

  assert.throws(() => validateCoverageMatrix(markdown), /Unsupported OpenAPI status/);
});

test('rejects malformed covered dates', () => {
  const markdown = validMatrix.replace('Covered · 2026-07-03', 'Covered · 2026-02-30');

  assert.throws(() => validateCoverageMatrix(markdown), /Invalid OpenAPI covered date/);
});

test('rejects an empty endpoint inventory', () => {
  const markdown = validMatrix.replace(/^\| `(?:GET|POST) \/api\/.*\|$/gm, '');

  assert.throws(() => validateCoverageMatrix(markdown), /no endpoint rows/);
});

test('includes the API-key-compatible markdown parser endpoint', () => {
  const matrix = parseCoverageMatrix(checkedInMatrix);

  assert.ok(matrix.rows.some(row => row.endpoint === 'POST /api/markdown/parse-to-html'));
});
