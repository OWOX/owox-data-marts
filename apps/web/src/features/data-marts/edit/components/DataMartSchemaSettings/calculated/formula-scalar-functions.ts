import { DataStorageType } from '../../../../../data-storage';

/**
 * Scalar functions the formula editor SUGGESTS, per warehouse dialect.
 *
 * A suggestion, never a validation: curated by hand and deliberately incomplete. The backend lets
 * every non-aggregate call through as scalar and leaves existence to the dry run, so absence from
 * this file must NEVER reject, warn about, underline or block a formula.
 *
 * It cannot BREAK a formula, but it may not LIE either: offering `SAFE_CAST` on Snowflake costs an
 * analyst a round trip through a save the dry run then rejects. Every name offered for a storage
 * must be one that warehouse's own reference documents; where support is uncertain, NARROW.
 *
 * Keep each storage at or under {@link MAX_SUGGESTIONS_PER_STORAGE}.
 */

/** A menu longer than this stops being a menu. The cut falls at the low-priority tail. */
const MAX_SUGGESTIONS_PER_STORAGE = 100;

/**
 * Offered on every dialect: a name belongs here only if all five warehouses document it AND allow it
 * over TABLE DATA. `CURRENT_TIMESTAMP`, `LOG` and `LN` failed the second half — Redshift restricts
 * them to the leader node, and a calculated field reading user tables fails with "Specified types or
 * functions … not supported on Redshift tables", which names neither the formula nor the function.
 * `LN`'s restriction is conditional on the argument type and appears only on its own doc page, so an
 * index sweep misses it.
 *
 * Includes the SQL keywords a `CASE` expression is built from, which an analyst looks for in the
 * same menu.
 */
const SHARED_SCALAR = [
  'ABS',
  'AND',
  'CASE',
  'CAST',
  'CEIL',
  'COALESCE',
  'CONCAT',
  'CURRENT_DATE',
  'DATE_TRUNC',
  'ELSE',
  'END',
  'EXP',
  'EXTRACT',
  'FLOOR',
  'GREATEST',
  'IN',
  'IS NOT NULL',
  'IS NULL',
  'LEAST',
  'LENGTH',
  'LOWER',
  'LPAD',
  'LTRIM',
  'MOD',
  'NOT',
  'NULLIF',
  'OR',
  'POWER',
  'REGEXP_REPLACE',
  'REPLACE',
  'REVERSE',
  'ROUND',
  'RPAD',
  'RTRIM',
  'SIGN',
  'SQRT',
  'THEN',
  'TRANSLATE',
  'TRIM',
  'UPPER',
  'WHEN',
];

/**
 * The entries that are SQL words rather than calls: completing them must not append `()`.
 *
 * Two groups. The logical and `CASE` keywords are bare everywhere. The niladic date functions are
 * here for a stricter reason: Trino (Athena) and Redshift REJECT `CURRENT_DATE`,
 * `CURRENT_TIMESTAMP` and `SYSDATE` with parentheses at all, so completing them as `NAME()` hands
 * the analyst a formula the warehouse refuses. Bare is legal on all five.
 *
 * NOT here: `NOW` and `GETDATE`, ordinary functions that DO require their parentheses.
 */
export const SCALAR_WORD_OPERATORS: readonly string[] = [
  'AND',
  'OR',
  'NOT',
  'IS NULL',
  'IS NOT NULL',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'IN',
  'CURRENT_DATE',
  'CURRENT_TIMESTAMP',
  'SYSDATE',
];

/** GoogleSQL scalar functions (BigQuery function reference). */
const BIGQUERY = [
  'IF',
  'IFNULL',
  'SAFE_CAST',
  'SAFE_DIVIDE',
  'DATE',
  'DATE_DIFF',
  'DATE_ADD',
  'DATE_SUB',
  'DATETIME_DIFF',
  'DATETIME_TRUNC',
  'TIMESTAMP_DIFF',
  'TIMESTAMP_TRUNC',
  'TIMESTAMP_ADD',
  'TIMESTAMP_SUB',
  'FORMAT_DATE',
  'FORMAT_TIMESTAMP',
  'PARSE_DATE',
  'PARSE_TIMESTAMP',
  'DATETIME',
  'TIMESTAMP',
  'CURRENT_TIMESTAMP',
  'CURRENT_DATETIME',
  'LAST_DAY',
  'UNIX_DATE',
  'UNIX_SECONDS',
  'UNIX_MILLIS',
  'DATE_FROM_UNIX_DATE',
  'SUBSTR',
  'LEFT',
  'RIGHT',
  'REGEXP_CONTAINS',
  'REGEXP_EXTRACT',
  'STARTS_WITH',
  'ENDS_WITH',
  'CONTAINS_SUBSTR',
  'SPLIT',
  'STRPOS',
  'INSTR',
  'CHAR_LENGTH',
  'FORMAT',
  'TO_JSON_STRING',
  'JSON_VALUE',
  'JSON_EXTRACT_SCALAR',
  'ARRAY_LENGTH',
  'ARRAY_TO_STRING',
  'DIV',
  'TRUNC',
  'LN',
  'LOG',
  'LOG10',
  'POW',
  'CEILING',
  'RAND',
];

/**
 * Trino/Presto scalar functions, as Athena engine v3 exposes them. The dialect with the fewest
 * borrowed spellings: no `LEFT`/`RIGHT`, no `TRUNC` (it is `TRUNCATE`), no `SAFE_CAST` (`TRY_CAST`).
 */
const ATHENA = [
  'IF',
  'TRY_CAST',
  'TRY',
  'DATE',
  'DATE_DIFF',
  'DATE_ADD',
  'DATE_FORMAT',
  'DATE_PARSE',
  'FROM_UNIXTIME',
  'TO_UNIXTIME',
  'CURRENT_TIMESTAMP',
  'NOW',
  'YEAR',
  'QUARTER',
  'MONTH',
  'WEEK',
  'DAY',
  'HOUR',
  'MINUTE',
  'SECOND',
  'DAY_OF_WEEK',
  'DAY_OF_MONTH',
  'DAY_OF_YEAR',
  'LAST_DAY_OF_MONTH',
  'PARSE_DATETIME',
  'FORMAT_DATETIME',
  'SUBSTR',
  'SUBSTRING',
  'SPLIT_PART',
  'SPLIT',
  'STRPOS',
  'POSITION',
  'REGEXP_LIKE',
  'REGEXP_EXTRACT',
  'CARDINALITY',
  'ELEMENT_AT',
  'CONTAINS',
  'ARRAY_JOIN',
  'JSON_EXTRACT_SCALAR',
  'JSON_PARSE',
  'JSON_FORMAT',
  'CEILING',
  'POW',
  'LN',
  'LOG',
  'LOG10',
  'LOG2',
  'TRUNCATE',
  'RANDOM',
  'FORMAT',
];

/** Snowflake scalar functions (Snowflake SQL function reference). */
const SNOWFLAKE = [
  'IFF',
  'IFNULL',
  'NVL',
  'NVL2',
  'ZEROIFNULL',
  'NULLIFZERO',
  'DIV0',
  'DIV0NULL',
  'DECODE',
  'EQUAL_NULL',
  'TRY_CAST',
  'TRY_TO_NUMBER',
  'TRY_TO_DATE',
  'TRY_TO_TIMESTAMP',
  'DATE',
  'TO_DATE',
  'TO_TIMESTAMP',
  'TO_NUMBER',
  'TO_DECIMAL',
  'TO_VARCHAR',
  'DATEADD',
  'DATEDIFF',
  'DATE_PART',
  'LAST_DAY',
  'CURRENT_TIMESTAMP',
  'CONVERT_TIMEZONE',
  'DAYNAME',
  'MONTHNAME',
  'YEAR',
  'QUARTER',
  'MONTH',
  'WEEK',
  'DAY',
  'HOUR',
  'MINUTE',
  'DAYOFWEEK',
  'SUBSTR',
  'SUBSTRING',
  'LEFT',
  'RIGHT',
  'SPLIT_PART',
  'SPLIT',
  'POSITION',
  'CHARINDEX',
  'CONTAINS',
  'STARTSWITH',
  'ENDSWITH',
  'REGEXP_LIKE',
  'REGEXP_SUBSTR',
  'INITCAP',
  'PARSE_JSON',
  'TRUNC',
  'TRUNCATE',
  'LN',
  'LOG',
];

/**
 * Redshift scalar functions, skipping two kinds of name: the ones AWS marks leader-node-only, since
 * a calculated field reads user tables and runs on the compute nodes, and the ones whose OWN page
 * adds a restriction the index page does not show (`LN` errors over `DECIMAL`, i.e. money).
 *
 * `GETDATE`/`SYSDATE` are AWS's own named remedy for `CURRENT_TIMESTAMP`. `DLOG10`/`DLOG1` are not
 * — they are presented only as synonyms, and what recommends them here is weaker: their doc pages
 * carry no restriction note where `LOG`'s and `LN`'s do.
 */
const REDSHIFT = [
  'NVL',
  'NVL2',
  'DECODE',
  'DATEADD',
  'DATEDIFF',
  'DATE_PART',
  'DATE_PART_YEAR',
  'GETDATE',
  'SYSDATE',
  'TO_DATE',
  'TO_TIMESTAMP',
  'TO_NUMBER',
  'TO_CHAR',
  'LAST_DAY',
  'ADD_MONTHS',
  'MONTHS_BETWEEN',
  'CONVERT_TIMEZONE',
  'TRUNC',
  'SUBSTRING',
  'LEFT',
  'RIGHT',
  'STRPOS',
  'POSITION',
  'CHARINDEX',
  'SPLIT_PART',
  'REGEXP_SUBSTR',
  'REGEXP_COUNT',
  'REGEXP_INSTR',
  'INITCAP',
  'BTRIM',
  'CHAR_LENGTH',
  'LEN',
  'JSON_EXTRACT_PATH_TEXT',
  // CAN_JSON_PARSE, not IS_VALID_JSON: AWS recommends against the latter by name.
  'CAN_JSON_PARSE',
  'JSON_PARSE',
  'CEILING',
  'DLOG1',
  'DLOG10',
  'RANDOM',
  'CONVERT',
];

/** Databricks SQL (Spark SQL) built-in scalar functions. */
const DATABRICKS = [
  'IF',
  'IFNULL',
  'NVL',
  'NVL2',
  'TRY_CAST',
  'TRY_DIVIDE',
  'TRY_TO_TIMESTAMP',
  'DATE',
  'DATE_ADD',
  'DATE_SUB',
  'DATEDIFF',
  'DATE_FORMAT',
  'DATE_PART',
  'TO_DATE',
  'TO_TIMESTAMP',
  'FROM_UNIXTIME',
  'UNIX_TIMESTAMP',
  'TO_UNIX_TIMESTAMP',
  'CURRENT_TIMESTAMP',
  'NOW',
  'YEAR',
  'QUARTER',
  'MONTH',
  'WEEKOFYEAR',
  'DAYOFWEEK',
  'DAYOFMONTH',
  'HOUR',
  'MINUTE',
  'SECOND',
  'LAST_DAY',
  'ADD_MONTHS',
  'MONTHS_BETWEEN',
  'TRUNC',
  'SUBSTR',
  'SUBSTRING',
  'LEFT',
  'RIGHT',
  'INSTR',
  'LOCATE',
  'SPLIT',
  'SPLIT_PART',
  'REGEXP_EXTRACT',
  'INITCAP',
  'CONCAT_WS',
  'FORMAT_STRING',
  'STARTSWITH',
  'ENDSWITH',
  'CONTAINS',
  'GET_JSON_OBJECT',
  'ELEMENT_AT',
  'CEILING',
  'POW',
  'LN',
  'LOG',
  'LOG10',
  'RAND',
];

/**
 * Which per-dialect extras a storage adds to {@link SHARED_SCALAR}. Keyed by {@link DataStorageType}
 * because this module — unlike the aggregate mirror next to it — is the web's own data, so it may
 * use the web's own enum. Legacy BigQuery is the same warehouse and so shares BigQuery's list, the
 * same pairing `aggregateFunctionsFor` makes.
 */
const EXTRA_BY_STORAGE: Readonly<Partial<Record<DataStorageType, readonly string[]>>> = {
  [DataStorageType.GOOGLE_BIGQUERY]: BIGQUERY,
  [DataStorageType.LEGACY_GOOGLE_BIGQUERY]: BIGQUERY,
  [DataStorageType.AWS_ATHENA]: ATHENA,
  [DataStorageType.SNOWFLAKE]: SNOWFLAKE,
  [DataStorageType.AWS_REDSHIFT]: REDSHIFT,
  [DataStorageType.DATABRICKS]: DATABRICKS,
};

/**
 * Scalar functions to suggest for this storage: de-duplicated, upper-case, sorted for a stable menu.
 *
 * A storage with no curated dialect gets an EMPTY list, not the shared set — the opposite of
 * `aggregateFunctionsFor`, on purpose. Shared aggregates are spelled the same in every dialect
 * worth the name; shared SCALARS are not, so offering them onto an unrecognised warehouse would be
 * guessing a dialect. Suggesting nothing costs a menu; suggesting a name the warehouse lacks costs
 * a failed dry run nobody can explain.
 */
export function scalarFunctionsFor(storageType: string): string[] {
  // Own-property check, not a bare lookup: `storageType` is a plain string off the wire, and
  // `scalarFunctionsFor('constructor')` would otherwise reach the prototype and throw on spread.
  // `hasOwnProperty.call`, not `Object.hasOwn`, because this app's TS lib is ES2020.
  if (!Object.prototype.hasOwnProperty.call(EXTRA_BY_STORAGE, storageType)) return [];
  const extras = EXTRA_BY_STORAGE[storageType as DataStorageType];
  if (!extras) return [];
  // Sorted AFTER the cap so the tail that gets dropped is the low-priority end of the curated
  // order, not whatever happens to sort last.
  return [...new Set([...SHARED_SCALAR, ...extras])].slice(0, MAX_SUGGESTIONS_PER_STORAGE).sort();
}
