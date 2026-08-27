import { TypeResolver } from '../../common/resolver/type-resolver';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';

/**
 * Which function names count as AGGREGATES in a given warehouse's SQL dialect, used to split a
 * calculated-field formula at its aggregate-call boundaries.
 *
 * This is deliberately not REPORT_AGGREGATE_FUNCTIONS (dto/schemas/aggregate-function.schema.ts):
 * that is the report builder's closed, storage-agnostic 12-literal picklist. A formula may spell
 * any aggregate the warehouse itself offers, so this whitelist is open-ended and dialect-specific.
 *
 * An unknown function name classifies as SCALAR. That is the safe default: its argument fields
 * then read as bare row-level columns and trip the level-mixing rule with an explicit message
 * naming the field, rather than being silently mis-routed as a group aggregate. Grow the list by
 * adding a name; do not add a fallback that guesses aggregate-ness from spelling.
 */
export interface FormulaFunctionDialect {
  readonly type: DataStorageType;
  isAggregateFunction(name: string): boolean;
}

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

class BaseFormulaFunctionDialect implements FormulaFunctionDialect {
  private readonly names: ReadonlySet<string>;

  constructor(
    readonly type: DataStorageType,
    extra: readonly string[]
  ) {
    this.names = new Set([...SHARED, ...extra].map(n => n.toUpperCase()));
  }

  isAggregateFunction(name: string): boolean {
    return this.names.has(name.trim().toUpperCase());
  }
}

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

const SHARED_SET: ReadonlySet<string> = new Set(SHARED.map(n => n.toUpperCase()));

/**
 * Whether EVERY supported dialect calls `name` an aggregate — i.e. whether it is in `SHARED`, the
 * base each dialect's set is built by EXTENDING. The one aggregate question answerable without
 * knowing the storage type.
 *
 * It exists for `calculatedFieldLevelOf`, which decides a GROUP BY at compose time and has no
 * dialect in hand (its four callers reach it from three services, none of which resolves one).
 * Restricting it to `SHARED` is what makes that safe rather than approximate: a name in this set is
 * an aggregate on all five storages, so the answer can never contradict the per-dialect derivation
 * the save-time validator ran. A dialect-SPECIFIC spelling deliberately answers `false` here — one
 * dialect's aggregate is another's scalar (Redshift has no `CORR`), and guessing on a union of all
 * five would turn a legal Redshift row-level formula into an ungrouped expression the warehouse
 * rejects. Those spellings stay answered by the recorded level, which can only ever upgrade.
 *
 * The spec pins the invariant this rests on: every `SHARED` name is an aggregate on every dialect.
 */
export function isUniversalAggregateFunction(name: string): boolean {
  return SHARED_SET.has(name.trim().toUpperCase());
}

/** Exposed only so the spec can assert every entry is already clean (trimmed, upper-cased). */
export const FORMULA_FUNCTION_DIALECT_NAME_LISTS: Readonly<Record<string, readonly string[]>> = {
  SHARED,
  BIGQUERY,
  ATHENA,
  SNOWFLAKE,
  REDSHIFT,
  DATABRICKS,
};

/**
 * Which of the aggregates above COUNT: over zero rows their answer is 0, not "no value". A metric
 * sleeve's outer pull has to read an empty join-back as 0 for these (`SleevePull.coalesceEmptyToZero`)
 * — the bare `ANY_VALUE` it is otherwise pulled through returns NULL, which blanks the cell and
 * turns every arithmetic that touches it NULL too.
 *
 * Names, not per-storage lists: counting-ness is a property of the function, and a name no dialect
 * above spells cannot reach a formula in the first place. Which is exactly what the spec asserts —
 * the first cut of this list carried `COUNT_DISTINCT`, the REPORT picklist's spelling that no
 * warehouse has, so it read as coverage while covering nothing. `APPROX_TOP_COUNT` is deliberately
 * absent: it answers with an array, not a count.
 */
const COUNTING = [
  'COUNT',
  'COUNTIF',
  'COUNT_IF',
  'APPROX_COUNT_DISTINCT',
  'APPROX_DISTINCT',
  'HLL',
];

const COUNTING_SET: ReadonlySet<string> = new Set(COUNTING);

export function isCountingFormulaFunction(name: string): boolean {
  return COUNTING_SET.has(name.trim().toUpperCase());
}

/** Exposed only so the spec can assert every counting name is one some dialect above spells. */
export const FORMULA_COUNTING_FUNCTION_NAMES: readonly string[] = COUNTING;

/**
 * Which of those counting aggregates count DISTINCT VALUES — exactly or approximately — rather than
 * rows. They ask the same question `COUNT(DISTINCT x)` asks, so a metric sleeve must compute them
 * over the same rows: the joined source's RAW values, never the values its pre-join roll-up already
 * collapsed per join key. Counting distinct roll-ups conflates raw values that happen to roll up
 * alike, which is the reason the report path's own COUNT_DISTINCT sleeve stays on raw.
 *
 * Keyed on the FUNCTION, not on the presence of a `DISTINCT` keyword: `APPROX_COUNT_DISTINCT(x)`
 * carries no quantifier and is the same question, so a quantifier-only gate answered it off the
 * roll-up while `COUNT(DISTINCT x)` answered it off the raw rows — two spellings, two numbers.
 *
 * `COUNTIF` / `COUNT_IF` are absent on purpose: they count ROWS matching a predicate.
 */
const DISTINCT_COUNTING = ['APPROX_COUNT_DISTINCT', 'APPROX_DISTINCT', 'HLL'];

const DISTINCT_COUNTING_SET: ReadonlySet<string> = new Set(DISTINCT_COUNTING);

export function isDistinctCountingFormulaFunction(name: string): boolean {
  return DISTINCT_COUNTING_SET.has(name.trim().toUpperCase());
}

/** Exposed so the spec can assert each name is one some dialect spells, and is itself counting. */
export const FORMULA_DISTINCT_COUNTING_FUNCTION_NAMES: readonly string[] = DISTINCT_COUNTING;

export function createFormulaFunctionDialectRegistry(): TypeResolver<
  DataStorageType,
  FormulaFunctionDialect
> {
  return new TypeResolver<DataStorageType, FormulaFunctionDialect>([
    new BaseFormulaFunctionDialect(DataStorageType.GOOGLE_BIGQUERY, BIGQUERY),
    new BaseFormulaFunctionDialect(DataStorageType.LEGACY_GOOGLE_BIGQUERY, BIGQUERY),
    new BaseFormulaFunctionDialect(DataStorageType.AWS_ATHENA, ATHENA),
    new BaseFormulaFunctionDialect(DataStorageType.SNOWFLAKE, SNOWFLAKE),
    new BaseFormulaFunctionDialect(DataStorageType.AWS_REDSHIFT, REDSHIFT),
    new BaseFormulaFunctionDialect(DataStorageType.DATABRICKS, DATABRICKS),
  ]);
}

export const FORMULA_FUNCTION_DIALECT_RESOLVER = Symbol('FORMULA_FUNCTION_DIALECT_RESOLVER');
