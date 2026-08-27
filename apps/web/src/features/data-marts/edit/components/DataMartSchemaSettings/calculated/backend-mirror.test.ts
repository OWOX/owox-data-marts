import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { serializeFormulaReference } from '../../../../../../../../backend/src/data-marts/calculated-fields/formula-reference';
import { DRAFT_FORMULA_MAX_LENGTH, MAX_DRAFT_CALCULATED_FIELDS } from './draft-calculated-fields';
import { toAuthoringForm } from './formula-authoring';
import { FORMULA_FUNCTION_DIALECT_NAME_LISTS } from './formula-function-dialects';

/**
 * Two modules under this directory are hand-ported copies of backend source, and one web decision
 * — which fields the formula editor offers — is a reading of a backend RULE that no web module
 * copies. Nothing in the type system, the build, or either app's own tests connects any of the
 * three to its original, so the only thing keeping them in step is a reader noticing the "port the
 * change here too" comment — which is exactly the guarantee this file replaces with a failing test.
 *
 * Every test here runs in the WEB suite on purpose: CI runs `@owox/web` for any change under
 * `apps/backend/**` as well as `apps/web/**` (see .github/workflows/test-owox.yml), so a drift
 * introduced from either side fails here.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
// calculated → DataMartSchemaSettings → components → edit → data-marts → features → src → web,
// landing on `apps/`.
const BACKEND_CALCULATED_FIELDS = resolve(
  HERE,
  '../../../../../../../..',
  'backend/src/data-marts/calculated-fields'
);

const readBackend = (file: string): string =>
  readFileSync(resolve(BACKEND_CALCULATED_FIELDS, file), 'utf-8');
const readWeb = (file: string): string => readFileSync(resolve(HERE, file), 'utf-8');

/** The one intentional divergence: the web copy opens with a block comment naming its origin. */
function stripPortHeader(source: string): { header: string; body: string } {
  const match = /^\/\*\*[\s\S]*?\*\/\s*/.exec(source);
  return match
    ? { header: match[0], body: source.slice(match[0].length) }
    : { header: '', body: source };
}

describe('sql-token-scanner is byte-identical to the backend lexer', () => {
  // The web editor's `resolveAll` and the backend's formula analyzer must agree, character offset
  // by character offset, on which spans are strings, comments and quoted identifiers. A drift
  // reintroduces the bug already caught once: an apostrophe inside a `--` comment swallowing the
  // rest of the formula, so a field reference after it silently stops resolving on one side only.
  it('matches the backend module apart from the port header', () => {
    const backend = readBackend('sql-token-scanner.ts');
    const web = stripPortHeader(readWeb('sql-token-scanner.ts'));

    // Guard the guard: if the header ever disappears, the strip becomes a no-op and this test
    // would still pass — but for the wrong reason.
    expect(web.header).toContain('faithful port of the backend');
    expect(web.body).toBe(backend);
  });
});

/**
 * The live check's request bounds, copied into the web so a draft that exceeds them is trimmed
 * instead of refused (`draft-calculated-fields.ts`). A copy that drifts LOW only costs an
 * unresolved sibling; drifting HIGH — the backend tightening a bound the web still sends up to —
 * makes every live check 400, and three of those leave the diagnostics panel empty for the rest of
 * the session, which reads as "your formula is clean". Neither app can notice that on its own.
 */
describe('the draft bounds match the endpoint that enforces them', () => {
  it('sends no more fields, and no longer a formula, than the DTO accepts', () => {
    const dto = readFileSync(
      resolve(BACKEND_CALCULATED_FIELDS, '../dto/presentation/validate-formula.api.dto.ts'),
      'utf-8'
    );
    const utils = readFileSync(
      resolve(BACKEND_CALCULATED_FIELDS, '../data-storage-types/data-mart-schema.utils.ts'),
      'utf-8'
    );

    // Read off the const rather than the decorator, and then check the decorator uses it — a
    // literal left behind in `@ArrayMaxSize` would otherwise pass while meaning something else.
    const declared = /const MAX_DRAFT_CALCULATED_FIELDS = (\d+);/.exec(dto)?.[1];
    expect(dto).toContain('@ArrayMaxSize(MAX_DRAFT_CALCULATED_FIELDS)');
    expect(Number(declared)).toBe(MAX_DRAFT_CALCULATED_FIELDS);

    // Scoped to the DRAFT entry's class, not the file: the submitted formula's own `@MaxLength`
    // carries the same const two classes up, so a file-wide search is satisfied by the wrong
    // decorator and a nested `@MaxLength(5_000)` passes — the drifting-HIGH direction, i.e. the
    // empty-panel failure, which is exactly the one this test exists for.
    const draftEntryClass = /export class DraftCalculatedFieldApiDto \{[\s\S]*?\n\}/.exec(dto)?.[0];
    const maxFormula = /export const CALCULATED_FORMULA_MAX_LENGTH = ([\d_]+);/.exec(utils)?.[1];
    expect(draftEntryClass).toContain('@MaxLength(CALCULATED_FORMULA_MAX_LENGTH)');
    // `10_000` in the source: the separator is a numeric literal's, not part of the number.
    expect(Number(maxFormula?.replace(/_/g, ''))).toBe(DRAFT_FORMULA_MAX_LENGTH);
  });
});

/**
 * The two reference indexes are deliberately asymmetric: `buildReferenceIndex` OFFERS a
 * calculated field of THIS Data Mart, `buildJoinedReferenceIndex` still skips one belonging to a
 * joined Data Mart. That asymmetry is not the web's taste — it is the backend analyzer's rule, and
 * the joined half of it is a security boundary: routing and `assertAllRequestedSourcesAccessible`
 * are both decided from the formula's own raw text, so a source reachable only through a joined
 * formula would be joined without ever being access-checked.
 *
 * Nothing in the web can notice that line moving in either direction — offering a joined formula
 * would push at the boundary, and re-refusing an own one would make every offer a guaranteed 400.
 * So the line is read here, from the source that draws it.
 */
describe('a calculated reference is refused only when it is joined', () => {
  it('has one refusal site, guarded on the reference having a path', () => {
    const source = readBackend('formula-analyzer.ts');

    expect(source.match(/FormulaViolations\.calculatedReference\(/g)).toHaveLength(1);

    // The line immediately above the refusal, rather than any occurrence in the file: what is
    // being pinned is what that one `errors.push` is conditional on.
    const guard = /\n(.*)\n\s*errors\.push\(FormulaViolations\.calculatedReference\(/.exec(source);
    expect(guard?.[1].trim()).toBe(
      "if (ref.path && (state === 'calculated-metric' || state === 'calculated-column')) {"
    );
  });
});

/**
 * The one contract in this file that can be checked by RUNNING both sides instead of reading
 * either one's source: the backend WRITES every stored tag through `serializeFormulaReference`
 * (canonicalization, on every accepted save), and `toAuthoringForm` is the only thing that READS
 * one back — through `TAG_PATTERN`, deliberately a strict regex rather than a parser, on the
 * promise that the writer only ever emits the canonical spelling.
 *
 * Exercised through `toAuthoringForm` rather than by exporting `TAG_PATTERN` for a test: the
 * pattern's job is not merely to match but to land `path` in the first group and `field` in the
 * second, and only the reader shows that. A drift in either direction — the writer changing the
 * attribute order, the spacing or the quoting; the reader tightening a group — makes a formula
 * that saves come back as literal tag text in the editor and resolve to nothing.
 */
describe('the tag the backend writes is one the web reads back', () => {
  const displayName = (ref: { path: string; field: string }): string =>
    ref.path ? `${ref.path}.${ref.field}` : ref.field;

  it.each([
    ['no path — a field of the metric’s own Data Mart', { path: '', field: 'revenue' }],
    ['a path — a joined Data Mart’s field', { path: 'orders', field: 'amount' }],
  ])('round-trips a reference with %s', (_shape, ref) => {
    const stored = serializeFormulaReference(ref);
    const { text, refs } = toAuthoringForm(stored, displayName);

    // The whole tag was consumed: nothing of `{{ref …}}` survives into what the analyst sees.
    expect(text).toBe(displayName(ref));
    expect(refs).toEqual([
      { text: displayName(ref), start: 0, end: displayName(ref).length, ...ref },
    ]);
  });
});

describe('the dialect aggregate-function lists match the backend', () => {
  /**
   * Extracts every `const NAME = [ … ];` string-array literal from the backend module. The lists
   * are plain, comment-free string arrays by construction (every explanatory comment sits ABOVE
   * its const), which is what makes reading them out of the source honest rather than clever.
   */
  function parseBackendNameLists(source: string): Record<string, string[]> {
    const lists: Record<string, string[]> = {};
    const pattern = /^const ([A-Z_]+) = \[([^\]]*)\];/gm;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      lists[match[1]] = match[2]
        .split(',')
        .map(entry => entry.trim().replace(/^['"]|['"]$/g, ''))
        .filter(entry => entry.length > 0);
    }
    return lists;
  }

  /**
   * Which of those consts are DIALECTS, read off the backend's own
   * `FORMULA_FUNCTION_DIALECT_NAME_LISTS` shorthand map. Not "every const array in the file": that
   * module also holds lists answering unrelated questions (`COUNTING`, `DISTINCT_COUNTING` — which
   * aggregates read an empty group as 0), which the web has no reason to mirror and which used to
   * fail this test the moment the backend gained one.
   */
  function parseBackendDialectNames(source: string): string[] {
    const match = /export const FORMULA_FUNCTION_DIALECT_NAME_LISTS[^{]*\{([^}]*)\}/.exec(source);
    return (match?.[1] ?? '')
      .split(',')
      .map(entry => entry.trim())
      .filter(entry => entry.length > 0);
  }

  /**
   * Which lists the backend actually REGISTERS per storage. Read separately from the map above so
   * the two can be held against each other: keying only off the map would let a new dialect const
   * that is registered but never added to the map pass silently here, and a whole storage would
   * then quietly offer nothing but SHARED in this editor.
   */
  function parseBackendRegisteredNames(source: string): string[] {
    const registry = /createFormulaFunctionDialectRegistry\(\)[\s\S]*?\n\}/.exec(source)?.[0] ?? '';
    const entries = registry.matchAll(/new BaseFormulaFunctionDialect\([^,]+,\s*([A-Z_]+)\s*\)/g);
    return [...new Set([...entries].map(entry => entry[1]))];
  }

  it('offers exactly the aggregates the backend parser recognizes, per dialect', () => {
    const source = readBackend('formula-function-dialect.ts');
    const backendLists = parseBackendNameLists(source);
    const dialectNames = parseBackendDialectNames(source);
    const registeredNames = parseBackendRegisteredNames(source);

    // Every extraction is only as trustworthy as its own result — assert they actually found the
    // lists, so a refactor that renames or reformats them fails here instead of silently comparing
    // two empty objects.
    expect([...dialectNames].sort()).toEqual([
      'ATHENA',
      'BIGQUERY',
      'DATABRICKS',
      'REDSHIFT',
      'SHARED',
      'SNOWFLAKE',
    ]);
    expect(backendLists.SHARED).toContain('SUM');

    // SHARED is the one member of the map no storage registers directly — it is merged into each.
    expect([...new Set([...registeredNames, 'SHARED'])].sort()).toEqual([...dialectNames].sort());

    const backendDialectLists = Object.fromEntries(
      dialectNames.map(name => [name, backendLists[name]])
    );
    expect(FORMULA_FUNCTION_DIALECT_NAME_LISTS).toEqual(backendDialectLists);
  });
});
