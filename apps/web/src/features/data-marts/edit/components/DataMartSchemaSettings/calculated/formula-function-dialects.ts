/**
 * A faithful port of the aggregate-function name lists the backend formula parser recognizes
 * (`apps/backend/src/data-marts/calculated-fields/formula-function-dialect.ts`, exported there as
 * `FORMULA_FUNCTION_DIALECT_NAME_LISTS`). The backend owns the lists; this copy exists only so the
 * formula editor can OFFER them — a formula whose function the parser does not know as an
 * aggregate has its arguments read as bare row-level columns and fails the level-mixing rule, so
 * suggesting a name the backend does not recognize would be worse than suggesting nothing.
 *
 * Kept in step by `backend-mirror.test.ts`, which reads both files: if the backend list changes,
 * that test fails until this one is updated. Do not "improve" a name here — fix it there first.
 */

const SHARED = [
  'SUM',
  'COUNT',
  'AVG',
  'MIN',
  'MAX',
  'STDDEV',
  'STDDEV_POP',
  'STDDEV_SAMP',
  'VARIANCE',
  'VAR_POP',
  'VAR_SAMP',
  'ANY_VALUE',
];

// GoogleSQL's own spellings: COUNTIF carries no underscore where every other dialect here writes
// COUNT_IF, and LOGICAL_AND / LOGICAL_OR are what the others call BOOL_AND / BOOL_OR.
const BIGQUERY = [
  'APPROX_COUNT_DISTINCT',
  'APPROX_QUANTILES',
  'APPROX_TOP_COUNT',
  'APPROX_TOP_SUM',
  'ARRAY_AGG',
  'ARRAY_CONCAT_AGG',
  'BIT_AND',
  'BIT_OR',
  'BIT_XOR',
  'CORR',
  'COUNTIF',
  'COVAR_POP',
  'COVAR_SAMP',
  'GROUPING',
  'LOGICAL_AND',
  'LOGICAL_OR',
  'MAX_BY',
  'MIN_BY',
  'STRING_AGG',
];
// Trino's spellings: BITWISE_*_AGG where the others say BIT_*, and EVERY as its alias for BOOL_AND.
const ATHENA = [
  'APPROX_DISTINCT',
  'APPROX_MOST_FREQUENT',
  'APPROX_PERCENTILE',
  'ARBITRARY',
  'ARRAY_AGG',
  'BITWISE_AND_AGG',
  'BITWISE_OR_AGG',
  'BITWISE_XOR_AGG',
  'BOOL_AND',
  'BOOL_OR',
  'CHECKSUM',
  'CORR',
  'COUNT_IF',
  'COVAR_POP',
  'COVAR_SAMP',
  'EVERY',
  'GEOMETRIC_MEAN',
  'HISTOGRAM',
  'KURTOSIS',
  'LISTAGG',
  'MAP_AGG',
  'MAP_UNION',
  'MAX_BY',
  'MIN_BY',
  'MULTIMAP_AGG',
  'NUMERIC_HISTOGRAM',
  'REDUCE_AGG',
  'REGR_INTERCEPT',
  'REGR_SLOPE',
  'SKEWNESS',
];
// BOOLAND_AGG / BOOLOR_AGG are Snowflake's real spellings — BOOL_AND / BOOL_OR do not exist here.
// Same trap twice more: SKEW, never SKEWNESS; COUNT_IF, never BigQuery's COUNTIF.
const SNOWFLAKE = [
  'APPROX_COUNT_DISTINCT',
  'APPROX_PERCENTILE',
  'APPROX_TOP_K',
  'ARRAY_AGG',
  'ARRAY_UNION_AGG',
  'ARRAY_UNIQUE_AGG',
  'BITAND_AGG',
  'BITOR_AGG',
  'BITXOR_AGG',
  'BOOLAND_AGG',
  'BOOLOR_AGG',
  'BOOLXOR_AGG',
  'CORR',
  'COUNT_IF',
  'COVAR_POP',
  'COVAR_SAMP',
  'GROUPING',
  'GROUPING_ID',
  'HASH_AGG',
  'HLL',
  'KURTOSIS',
  'LISTAGG',
  'MAX_BY',
  'MEDIAN',
  'MIN_BY',
  'MODE',
  'OBJECT_AGG',
  'PERCENTILE_CONT',
  'PERCENTILE_DISC',
  'REGR_AVGX',
  'REGR_AVGY',
  'REGR_COUNT',
  'REGR_INTERCEPT',
  'REGR_R2',
  'REGR_SLOPE',
  'REGR_SXX',
  'REGR_SXY',
  'REGR_SYY',
  'SKEW',
  'VARIANCE_POP',
  'VARIANCE_SAMP',
];
// By far the sparsest set: no CORR, no MODE, none of the Postgres statistical-aggregate family.
// PERCENTILE_DISC is WINDOW-ONLY here — AWS's aggregate spelling is the two-word
// `APPROXIMATE PERCENTILE_DISC`, which the call finder cannot see, so neither form belongs here.
const REDSHIFT = [
  'BIT_AND',
  'BIT_OR',
  'BOOL_AND',
  'BOOL_OR',
  'LISTAGG',
  'MEDIAN',
  'PERCENTILE_CONT',
];
// ANY and SOME are documented aggregates here and deliberately absent: both spellings are also the
// quantified-comparison operators, so `x = ANY(…)` would read a scalar comparison as a metric.
const DATABRICKS = [
  'APPROX_COUNT_DISTINCT',
  'APPROX_PERCENTILE',
  'APPROX_TOP_K',
  'ARRAY_AGG',
  'BIT_AND',
  'BIT_OR',
  'BIT_XOR',
  'BOOL_AND',
  'BOOL_OR',
  'COLLECT_LIST',
  'COLLECT_SET',
  'CORR',
  'COUNT_IF',
  'COVAR_POP',
  'COVAR_SAMP',
  'EVERY',
  'FIRST',
  'FIRST_VALUE',
  'HISTOGRAM_NUMERIC',
  'KURTOSIS',
  'LAST',
  'LAST_VALUE',
  'LISTAGG',
  'MAX_BY',
  'MEAN',
  'MEDIAN',
  'MIN_BY',
  'MODE',
  'PERCENTILE',
  'PERCENTILE_APPROX',
  'PERCENTILE_CONT',
  'PERCENTILE_DISC',
  'REGR_AVGX',
  'REGR_AVGY',
  'REGR_COUNT',
  'REGR_INTERCEPT',
  'REGR_R2',
  'REGR_SLOPE',
  'REGR_SXX',
  'REGR_SXY',
  'REGR_SYY',
  'SKEWNESS',
  'STD',
  'STRING_AGG',
  'TRY_AVG',
  'TRY_SUM',
];

/** The shape `backend-mirror.test.ts` compares against the backend module, key for key. */
export const FORMULA_FUNCTION_DIALECT_NAME_LISTS: Readonly<Record<string, readonly string[]>> = {
  SHARED,
  BIGQUERY,
  ATHENA,
  SNOWFLAKE,
  REDSHIFT,
  DATABRICKS,
};

/**
 * Which per-dialect list a storage adds to {@link SHARED}. Deliberately keyed by the same storage
 * literals `DataStorageType` uses rather than importing the enum, so this module stays a plain
 * data mirror of the backend's own registry (`createFormulaFunctionDialectRegistry`).
 */
const EXTRA_BY_STORAGE: Readonly<Record<string, readonly string[]>> = {
  GOOGLE_BIGQUERY: BIGQUERY,
  LEGACY_GOOGLE_BIGQUERY: BIGQUERY,
  AWS_ATHENA: ATHENA,
  SNOWFLAKE: SNOWFLAKE,
  AWS_REDSHIFT: REDSHIFT,
  DATABRICKS: DATABRICKS,
};

/**
 * Every aggregate function a formula on this storage may use, sorted for a stable menu. An unknown
 * storage falls back to the shared set alone — offering only what is certainly right everywhere,
 * rather than guessing another dialect's spellings onto it.
 */
export function aggregateFunctionsFor(storageType: string): string[] {
  return [...SHARED, ...(EXTRA_BY_STORAGE[storageType] ?? [])].sort((a, b) => a.localeCompare(b));
}

/**
 * The guarded-division pattern the save-time validator warns about the absence of
 * (`FORMULA_UNGUARDED_DIVISION`). Decision 6 downgraded unguarded division from an error to a
 * warning on the explicit grounds that the validator warns AND autocomplete offers the guarded
 * form — so this is the other half of that bargain, not a nicety. `NULLIF` is the one spelling
 * every supported warehouse accepts (BigQuery's SAFE_DIVIDE and Snowflake's DIV0 are not portable).
 */
export const GUARDED_DIVISION_SNIPPET = {
  label: 'guarded division',
  detail: 'SUM(a) / NULLIF(SUM(b), 0)',
  documentation:
    'Divide without risking a division-by-zero error or a wrong NULL: NULLIF turns a zero ' +
    'denominator into NULL, so the result is NULL instead of failing the query.',
  /** Monaco snippet syntax — `${n:placeholder}` are the tab stops. */
  insertText: 'SUM(${1:numerator}) / NULLIF(SUM(${2:denominator}), 0)',
} as const;
