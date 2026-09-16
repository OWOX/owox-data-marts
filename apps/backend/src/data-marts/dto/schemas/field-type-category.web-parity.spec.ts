/**
 * The five type-category sets exist twice: here, where they decide what the SERVER aggregates, and
 * in the web picker, where they decide which operators and which automatic-aggregation ghost the
 * analyst is shown. They are hand-written in both places because the packages do not share code.
 *
 * Drift between them is silent and asymmetric: a type the backend calls a number and the web calls
 * "other" loses its ghost while the server still aggregates it, and the reverse promises a collapse
 * that never happens. Neither shows up as a failure anywhere else. A new dialect vocabulary — the
 * Postgres-compatible destinations on the roadmap add `INT2`/`INT4`/`INT8` — lands in one file
 * first, and this is what says so.
 *
 * Reads the web source as text rather than importing it: `apps/web` is a separate package with its
 * own build, and a cross-package import would tie this suite to it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRIORITY_BY_CATEGORY } from './field-aggregation-governance';
import {
  BOOL_TYPES,
  DATE_TYPES,
  NUMBER_TYPES,
  STRING_TYPES,
  TIME_TYPES,
} from './field-type-category';

const WEB_GOVERNANCE_FILE = join(
  __dirname,
  '../../../../../web/src/features/data-marts/shared/utils/aggregation-governance.ts'
);

const WEB_OPERATORS_FILE = join(
  __dirname,
  '../../../../../web/src/features/data-marts/edit/components/ReportColumnPicker/output-controls-operators.ts'
);

/** `const NAME = new Set([...])`, read as the literal list it is. */
function webSet(source: string, name: string): string[] {
  const match = new RegExp(`const ${name}\\s*=\\s*new Set\\(\\[([^\\]]*)\\]`).exec(source);
  if (!match) throw new Error(`${name} not found in the web operators file`);
  return [...match[1].matchAll(/'([^']*)'/g)].map(entry => entry[1]).sort();
}

/**
 * One category's list out of the web `PRIORITY_BY_CATEGORY` literal. Scoped to that object first:
 * the same category keys appear in SUPPORTED_BY_CATEGORY and DEFAULTS_BY_CATEGORY above it.
 */
function webPriority(source: string, category: string): string[] {
  const start = source.indexOf('PRIORITY_BY_CATEGORY');
  if (start < 0) throw new Error('PRIORITY_BY_CATEGORY not found in the web governance file');
  const block = source.slice(start, source.indexOf('};', start));
  const match = new RegExp(`\\b${category}:\\s*\\[([^\\]]*)\\]`).exec(block);
  if (!match) throw new Error(`${category} not found in the web priority table`);
  return [...match[1].matchAll(/'([^']*)'/g)].map(entry => entry[1]);
}

describe('the automatic-pick priority matches the web picker', () => {
  // Drift here is worse than a type-set drift: the picker draws a ghost naming a function the
  // server will not apply, or draws none where it does — the exact promise this feature makes.
  const source = readFileSync(WEB_GOVERNANCE_FILE, 'utf8');

  it.each(Object.keys(PRIORITY_BY_CATEGORY))('%s is in the same ORDER on both sides', category => {
    expect(webPriority(source, category)).toEqual(
      PRIORITY_BY_CATEGORY[category as keyof typeof PRIORITY_BY_CATEGORY]
    );
  });
});

describe('field type categories match the web picker', () => {
  const source = readFileSync(WEB_OPERATORS_FILE, 'utf8');

  it.each([
    ['STRING_TYPES', STRING_TYPES],
    ['NUMBER_TYPES', NUMBER_TYPES],
    ['DATE_TYPES', DATE_TYPES],
    ['TIME_TYPES', TIME_TYPES],
  ])('%s is spelled identically on both sides', (name, backendSet) => {
    expect(webSet(source, name)).toEqual([...backendSet].sort());
  });

  it('BOOL_TYPES is spelled identically on both sides', () => {
    expect(webSet(source, 'BOOL_TYPES')).toEqual([...BOOL_TYPES].sort());
  });
});
