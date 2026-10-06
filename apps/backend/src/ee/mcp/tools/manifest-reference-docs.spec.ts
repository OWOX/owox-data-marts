import { readFileSync } from 'fs';
import { resolve } from 'path';
import { MANIFEST_SCHEMA_REFERENCE } from './manifest-schema.reference';

it('docs/connectors/manifest-reference.llms.txt mirrors the constant exactly', () => {
  const p = resolve(__dirname, '../../../../../../docs/connectors/manifest-reference.llms.txt');
  expect(readFileSync(p, 'utf8')).toBe(MANIFEST_SCHEMA_REFERENCE);
});
