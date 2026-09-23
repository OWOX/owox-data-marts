import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');

const PARSER_SOURCE = read('../../src/Core/Declarative/ManifestParser.js');
const GUIDE = read('../../../../docs/connectors/manifest-reference.llms.txt');

const CONST_NAMES = [
  'SUPPORTED_AUTH_TYPES',
  'PAGINATION_TYPES',
  'DATE_STRATEGIES',
  'TRANSFORM_TYPES',
  'RECORD_FILTER_OPERATORS',
  'ERROR_ACTIONS',
  'BACKOFF_TYPES',
];

function enumValues(constName) {
  const match = PARSER_SOURCE.match(new RegExp(`${constName}\\s*=\\s*new Set\\(\\[([^\\]]*)\\]`));
  if (!match) throw new Error(`Could not find ${constName} in ManifestParser`);
  return [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
}

// An AI assistant writes manifests from this guide alone, so a value it omits is one no
// assistant will ever produce.
describe('docs/connectors/manifest-reference.llms.txt', () => {
  for (const name of CONST_NAMES) {
    it(`documents every ${name} value`, () => {
      const values = enumValues(name);
      assert.ok(values.length > 0, `${name} has no values`);
      for (const value of values) {
        assert.ok(GUIDE.includes(value), `${name} value '${value}' is missing from the guide`);
      }
    });
  }
});
