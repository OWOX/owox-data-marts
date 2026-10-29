import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { blank, lexSql, type SqlLexingOptions } from './sql-lexing';

/**
 * A reference to another Data Mart inside a SQL Data Mart's query, written as
 * `[Title](dm:<id>)` in place of a table name:
 *
 *   SELECT * FROM [Orders](dm:96c33880-70e3-4151-9a07-ae379c994898) WHERE order_type = 'Retail'
 *
 * The id is what the reference points at; the title is a label for the reader, refreshed from the
 * referenced Data Mart whenever the query is saved. Nothing is resolved here — see
 * `DataMartSqlReferenceResolver` for how a reference becomes SQL the warehouse can run.
 */
export interface DataMartSqlReference {
  /** The referenced Data Mart's id, lower-cased. */
  id: string;
  /** The label as written, with escapes removed. */
  title: string;
  /** Offset of the opening `[`. */
  start: number;
  /** Offset just past the closing `)`. */
  end: number;
}

const ID_PATTERN = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

/** Cheap pre-check: every reference contains this marker, so text without it has none. */
const REFERENCE_MARKER = '](dm:';

// A title may hold any character except a line break; `\`, `[` and `]` are backslash-escaped.
const referencePattern = () =>
  new RegExp(String.raw`\[((?:\\.|[^\\\[\]\r\n])*)\]\(dm:(${ID_PATTERN})\)`, 'g');

export type ParseDataMartReferencesOptions = SqlLexingOptions;

/** Lexing rules for SQL written for `storageType`. */
export function sqlLexingOptionsFor(storageType: DataStorageType): SqlLexingOptions {
  const bigQuery =
    storageType === DataStorageType.GOOGLE_BIGQUERY ||
    storageType === DataStorageType.LEGACY_GOOGLE_BIGQUERY;
  const snowflake = storageType === DataStorageType.SNOWFLAKE;
  return {
    hashLineComments: bigQuery,
    tripleQuotedStrings: bigQuery,
    slashLineComments: snowflake,
    dollarQuotedStrings: snowflake,
    backslashIsLiteral: storageType === DataStorageType.AWS_ATHENA,
  };
}

/**
 * Finds the Data Mart references in `sql`, in order. References inside string literals,
 * comments and quoted identifiers are not references and are skipped.
 */
export function parseDataMartReferences(
  sql: string,
  options: ParseDataMartReferencesOptions = {}
): DataMartSqlReference[] {
  if (!sql.includes(REFERENCE_MARKER)) return [];

  const candidates: DataMartSqlReference[] = [];
  for (const match of sql.matchAll(referencePattern())) {
    const start = match.index ?? 0;
    candidates.push({
      id: match[2].toLowerCase(),
      title: unescapeTitle(match[1]),
      start,
      end: start + match[0].length,
    });
  }
  if (candidates.length === 0) return [];

  // The title is free text: an apostrophe in `[O'Brien orders](dm:…)` must not open a string
  // literal for the scanner. Blank every candidate out before lexing, keeping offsets intact.
  const { nonCode: excluded } = lexSql(maskDataMartReferences(sql, candidates), options);

  return candidates.filter(
    candidate => !excluded.some(([from, to]) => candidate.start >= from && candidate.start < to)
  );
}

export function hasDataMartReferences(
  sql: string,
  options: ParseDataMartReferencesOptions = {}
): boolean {
  return parseDataMartReferences(sql, options).length > 0;
}

/** `sql` with every given reference blanked out, offsets unchanged. */
export function maskDataMartReferences(
  sql: string,
  references: readonly Pick<DataMartSqlReference, 'start' | 'end'>[]
): string {
  return references.reduce((text, ref) => blank(text, ref.start, ref.end), sql);
}

/** Writes a reference in its canonical form. */
export function serializeDataMartReference(reference: { id: string; title: string }): string {
  return `[${escapeTitle(reference.title)}](dm:${reference.id.toLowerCase()})`;
}

/**
 * Replaces each reference with the text `render` returns for it. References must come from
 * {@link parseDataMartReferences} on the same `sql`. They are rendered one at a time, in order:
 * a renderer that fails stops the rest.
 */
export async function replaceDataMartReferences(
  sql: string,
  references: readonly DataMartSqlReference[],
  render: (reference: DataMartSqlReference, index: number) => Promise<string> | string
): Promise<string> {
  const rendered: string[] = [];
  for (const [index, ref] of references.entries()) {
    rendered.push(await render(ref, index));
  }
  let result = sql;
  // From the end, so earlier offsets stay valid.
  for (let index = references.length - 1; index >= 0; index--) {
    const ref = references[index];
    result = result.slice(0, ref.start) + rendered[index] + result.slice(ref.end);
  }
  return result;
}

/**
 * Last line of defence for code that hands a SQL Data Mart's query to a warehouse: a reference
 * that reached this point was never resolved, and the warehouse would reject it with a confusing
 * syntax error. Failing here names the actual problem.
 */
export function assertNoDataMartReferences(
  sql: string,
  where: string,
  options: ParseDataMartReferencesOptions = {}
): void {
  if (hasDataMartReferences(sql, options)) {
    throw new Error(
      `${where}: the SQL still contains a Data Mart reference ([Title](dm:<id>)). ` +
        'References must be resolved before the query reaches the storage.'
    );
  }
}

function unescapeTitle(raw: string): string {
  return raw.replace(/\\(.)/g, '$1');
}

function escapeTitle(title: string): string {
  return title
    .replace(/[\r\n]+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

/**
 * How deep references may nest: B → A → … A query this deep is rarely intentional, and every
 * level adds the referenced query's full text to the one the warehouse receives.
 */
export const MAX_DATA_MART_REFERENCE_DEPTH = 10;

/**
 * The longest SQL resolving may produce, in characters. Each reference adds the referenced query's
 * full text, so a few references per level grow it exponentially with depth. The strictest
 * warehouse limits are 256 KB (AWS Athena) and 1 MB (Google BigQuery, Snowflake): a longer query
 * fails there anyway, and building one could exhaust the server's memory first.
 */
export const MAX_RESOLVED_SQL_LENGTH = 1_000_000;

/**
 * A SQL definition's query for storage code to run, checked for unresolved references. Storage
 * code receives definitions that were resolved upstream; this catches a path that skipped that.
 */
export function resolvedSqlQueryOf(
  definition: { sqlQuery: string },
  storageType: DataStorageType
): string {
  assertNoDataMartReferences(
    definition.sqlQuery,
    `${storageType} query builder`,
    sqlLexingOptionsFor(storageType)
  );
  return definition.sqlQuery;
}
