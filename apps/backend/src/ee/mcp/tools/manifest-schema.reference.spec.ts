import { readFileSync } from 'fs';
import { resolve } from 'path';
import { MANIFEST_SCHEMA_REFERENCE, MANIFEST_SCHEMA_VERSION } from './manifest-schema.reference';

// From apps/backend/src/ee/mcp/tools → repo root is six levels up.
const PARSER_PATH = resolve(
  __dirname,
  '../../../../../../packages/connectors/src/Core/Declarative/ManifestParser.js'
);

// Each engine enum value MUST appear verbatim in the reference. This is the
// guard that would have caught the oauth2 omission in the internal prompt.
const CONST_NAMES = [
  'SUPPORTED_AUTH_TYPES',
  'PAGINATION_TYPES',
  'DATE_STRATEGIES',
  'TRANSFORM_TYPES',
  'RECORD_FILTER_OPERATORS',
  'ERROR_ACTIONS',
  'BACKOFF_TYPES',
];

function enumValues(source: string, constName: string): string[] {
  const m = source.match(new RegExp(`${constName}\\s*=\\s*new Set\\(\\[([^\\]]*)\\]`));
  if (!m) throw new Error(`Could not find ${constName} in ManifestParser`);
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
}

describe('MANIFEST_SCHEMA_REFERENCE', () => {
  const parserSource = readFileSync(PARSER_PATH, 'utf8');

  it('has a dated version', () => {
    expect(MANIFEST_SCHEMA_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  for (const name of CONST_NAMES) {
    it(`documents every ${name} value`, () => {
      const values = enumValues(parserSource, name);
      expect(values.length).toBeGreaterThan(0);
      for (const value of values) {
        expect(MANIFEST_SCHEMA_REFERENCE).toContain(value);
      }
    });
  }
});
