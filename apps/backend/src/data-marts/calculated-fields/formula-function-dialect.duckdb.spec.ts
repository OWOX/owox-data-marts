import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import {
  createFormulaFunctionDialectRegistry,
  isCountingFormulaFunction,
  isDistinctCountingFormulaFunction,
} from './formula-function-dialect';

/**
 * DuckDB's OWN spellings. The shared registry spec iterates `DataStorageType`, so it already proves
 * a DuckDB dialect resolves and that SHARED names, the window-only family and obvious scalars
 * classify correctly there. What it cannot see is the trap that makes this dialect worth a
 * hand-checked list: DuckDB is Postgres-shaped, so the cheap move is to alias REDSHIFT — or, since
 * the list is long, DATABRICKS — and either would claim names DuckDB rejects at query time.
 * Every case below was checked against the engine itself, not inferred from the family resemblance.
 */
describe('FormulaFunctionDialect — DuckDB spellings', () => {
  const registry = createFormulaFunctionDialectRegistry();
  const duckdb = () => registry.resolve(DataStorageType.DUCKDB);

  // Exactly why REDSHIFT (PERCENTILE_CONT) and DATABRICKS (both) cannot be aliased here: DuckDB has
  // neither spelling. `DuckDbClauseRenderer.renderPercentile` emits `quantile_cont` for that same
  // reason, so a PERCENTILE_* entry would offer users a function this branch's own renderer already
  // knows is absent.
  it('spells percentiles QUANTILE_*, and never claims PERCENTILE_*', async () => {
    const dialect = await duckdb();
    for (const name of ['QUANTILE', 'QUANTILE_CONT', 'QUANTILE_DISC']) {
      expect(`${name}: ${dialect.isAggregateFunction(name)}`).toBe(`${name}: true`);
    }
    for (const name of ['PERCENTILE_CONT', 'PERCENTILE_DISC']) {
      expect(`${name}: ${dialect.isAggregateFunction(name)}`).toBe(`${name}: false`);
    }
  });

  // Databricks calls all four aggregates; DuckDB calls only the short pair one. FIRST_VALUE /
  // LAST_VALUE / NTH_VALUE / PERCENT_RANK bind ONLY with OVER here — the engine answers a bare call
  // with "Scalar Function with name first_value does not exist!" — so they extend the shared spec's
  // window-only list rather than repeating it.
  it('aggregates FIRST / LAST but not DuckDB’s extra window-only names', async () => {
    const dialect = await duckdb();
    for (const name of ['FIRST', 'LAST']) {
      expect(`${name}: ${dialect.isAggregateFunction(name)}`).toBe(`${name}: true`);
    }
    for (const name of ['FIRST_VALUE', 'LAST_VALUE', 'NTH_VALUE', 'PERCENT_RANK', 'RANK_DENSE']) {
      expect(`${name}: ${dialect.isAggregateFunction(name)}`).toBe(`${name}: false`);
    }
  });

  // Three near-misses borrowed from neighbouring dialects that DuckDB does not answer to: Athena's
  // APPROX_DISTINCT, Snowflake's HLL and SKEW.
  it('uses its own approximate and statistical spellings, not its neighbours’', async () => {
    const dialect = await duckdb();
    expect(dialect.isAggregateFunction('APPROX_COUNT_DISTINCT')).toBe(true);
    expect(dialect.isAggregateFunction('SKEWNESS')).toBe(true);
    for (const name of ['APPROX_DISTINCT', 'HLL', 'SKEW']) {
      expect(`${name}: ${dialect.isAggregateFunction(name)}`).toBe(`${name}: false`);
    }
  });

  // The only dialect here that answers to both spellings, so neither can be dropped as a typo of
  // the other: BigQuery has only COUNTIF, Athena/Snowflake/Databricks only COUNT_IF.
  it('spells conditional counting both ways', async () => {
    const dialect = await duckdb();
    expect(dialect.isAggregateFunction('COUNTIF')).toBe(true);
    expect(dialect.isAggregateFunction('COUNT_IF')).toBe(true);
  });

  // Both are real entries in DuckDB's function catalog and both are deliberately out: COUNT_STAR is
  // `count(*)` with no column to aggregate, and the binder refuses SUM_NO_OVERFLOW outright as
  // "for internal use only". Pinned because a future refresh straight off that catalog would sweep
  // them back in.
  it('leaves out the catalog’s zero-argument and internal-only aggregates', async () => {
    const dialect = await duckdb();
    for (const name of ['COUNT_STAR', 'SUM_NO_OVERFLOW']) {
      expect(`${name}: ${dialect.isAggregateFunction(name)}`).toBe(`${name}: false`);
    }
  });

  // The counting lists are keyed on names, not on storages, so adding a dialect can silently miss
  // them. This is the join that matters on DuckDB: its distinct-count spelling must read an empty
  // join-back as 0 and be computed over raw values, exactly as `COUNT(DISTINCT x)` is.
  it('routes its distinct-count spelling through the counting rules', async () => {
    const dialect = await duckdb();
    expect(dialect.isAggregateFunction('APPROX_COUNT_DISTINCT')).toBe(true);
    expect(isCountingFormulaFunction('APPROX_COUNT_DISTINCT')).toBe(true);
    expect(isDistinctCountingFormulaFunction('APPROX_COUNT_DISTINCT')).toBe(true);
    // COUNTIF counts ROWS matching a predicate, so it coalesces to 0 but is not distinct-counting.
    expect(isCountingFormulaFunction('COUNTIF')).toBe(true);
    expect(isDistinctCountingFormulaFunction('COUNTIF')).toBe(false);
  });
});
