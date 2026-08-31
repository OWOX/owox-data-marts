import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import {
  createFormulaFunctionDialectRegistry,
  FORMULA_COUNTING_FUNCTION_NAMES,
  FORMULA_DISTINCT_COUNTING_FUNCTION_NAMES,
  FORMULA_FUNCTION_DIALECT_NAME_LISTS,
  isCountingFormulaFunction,
  isDistinctCountingFormulaFunction,
  isUniversalAggregateFunction,
} from './formula-function-dialect';

describe('FormulaFunctionDialect registry', () => {
  const registry = createFormulaFunctionDialectRegistry();

  // Iterates the enum rather than a hard-coded list of names: a seventh storage type added later
  // has no dialect array here and must fail this test loudly instead of silently resolving to
  // nothing.
  it.each(Object.values(DataStorageType))('resolves a dialect for %s', async storageType => {
    await expect(registry.resolve(storageType)).resolves.toMatchObject({ type: storageType });
  });

  it('classifies shared aggregates on every storage', async () => {
    for (const type of Object.values(DataStorageType)) {
      const dialect = await registry.resolve(type);
      expect(dialect.isAggregateFunction('sum')).toBe(true);
      expect(dialect.isAggregateFunction('COUNT')).toBe(true);
      expect(dialect.isAggregateFunction('NULLIF')).toBe(false);
    }
  });

  // What makes `isUniversalAggregateFunction` safe to ask WITHOUT a storage type — which is the
  // only reason `calculatedFieldLevelOf` can derive a level from formula text at all. Iterates
  // every registered dialect against the SHARED list itself, so a name moved out of SHARED into
  // one dialect's own array fails here rather than silently narrowing the compose-time rule.
  it('SHARED names are aggregates on every registered dialect', async () => {
    for (const type of Object.values(DataStorageType)) {
      const dialect = await registry.resolve(type);
      for (const name of FORMULA_FUNCTION_DIALECT_NAME_LISTS.SHARED) {
        expect([name, dialect.isAggregateFunction(name)]).toEqual([name, true]);
        expect([name, isUniversalAggregateFunction(name)]).toEqual([name, true]);
      }
    }
  });

  // The other direction: a dialect-specific spelling must NOT read as universal, or the seat would
  // upgrade a Redshift formula on the strength of a name Redshift calls scalar.
  it('does not call a dialect-specific aggregate universal', () => {
    expect(isUniversalAggregateFunction('CORR')).toBe(false);
    expect(isUniversalAggregateFunction('LISTAGG')).toBe(false);
    expect(isUniversalAggregateFunction('NULLIF')).toBe(false);
  });

  it('knows dialect-specific aggregates', async () => {
    expect(
      (await registry.resolve(DataStorageType.GOOGLE_BIGQUERY)).isAggregateFunction(
        'APPROX_COUNT_DISTINCT'
      )
    ).toBe(true);
    expect(
      (await registry.resolve(DataStorageType.AWS_ATHENA)).isAggregateFunction('APPROX_DISTINCT')
    ).toBe(true);
  });

  it('shares the BigQuery dialect with LEGACY_GOOGLE_BIGQUERY', async () => {
    const bigquery = await registry.resolve(DataStorageType.GOOGLE_BIGQUERY);
    const legacy = await registry.resolve(DataStorageType.LEGACY_GOOGLE_BIGQUERY);
    expect(legacy.isAggregateFunction('APPROX_COUNT_DISTINCT')).toBe(true);
    expect(legacy.isAggregateFunction('APPROX_COUNT_DISTINCT')).toBe(
      bigquery.isAggregateFunction('APPROX_COUNT_DISTINCT')
    );
  });

  it('is dialect-specific: a name aggregate on one storage is not automatically aggregate on another', async () => {
    const snowflake = await registry.resolve(DataStorageType.SNOWFLAKE);
    const bigquery = await registry.resolve(DataStorageType.GOOGLE_BIGQUERY);
    expect(snowflake.isAggregateFunction('LISTAGG')).toBe(true);
    expect(bigquery.isAggregateFunction('LISTAGG')).toBe(false);
  });

  // AWS documents PERCENTILE_DISC on Redshift under WINDOW functions only, and its aggregate form
  // as the two-word `APPROXIMATE PERCENTILE_DISC` — two words the call finder can never see as one
  // name. The bare spelling sat in the Redshift list regardless; this pins its removal.
  it('does not call Redshift’s window-only PERCENTILE_DISC an aggregate', async () => {
    const redshift = await registry.resolve(DataStorageType.AWS_REDSHIFT);
    expect(redshift.isAggregateFunction('PERCENTILE_DISC')).toBe(false);
    // The neighbouring spelling AWS does document as an aggregate, so this reads as the specific
    // claim it is rather than as "Redshift has no percentiles".
    expect(redshift.isAggregateFunction('PERCENTILE_CONT')).toBe(true);
    expect(
      (await registry.resolve(DataStorageType.SNOWFLAKE)).isAggregateFunction('PERCENTILE_DISC')
    ).toBe(true);
  });

  // Databricks documents ANY and SOME as aggregate functions, and they are deliberately left out:
  // both spellings are also its quantified-comparison operators, so `x = ANY(…)` — a scalar
  // comparison — would classify as a metric and be projected ungrouped, silently, at the wrong
  // grain. EVERY, the third of that family, carries no such second meaning and is in.
  it('leaves out a documented aggregate whose spelling is also an operator', async () => {
    const databricks = await registry.resolve(DataStorageType.DATABRICKS);
    expect(databricks.isAggregateFunction('ANY')).toBe(false);
    expect(databricks.isAggregateFunction('SOME')).toBe(false);
    expect(databricks.isAggregateFunction('EVERY')).toBe(true);
  });

  // A name that is ONLY a window function is not an aggregate anywhere: it needs OVER, which the
  // analyzer refuses separately, so calling it one can only mislead. Checked against every dialect
  // because the lists are grown by hand and these are the names most likely to be swept in.
  it('never classifies a window-only function as an aggregate', async () => {
    const windowOnly = ['ROW_NUMBER', 'RANK', 'DENSE_RANK', 'LAG', 'LEAD', 'NTILE', 'CUME_DIST'];
    for (const type of Object.values(DataStorageType)) {
      const dialect = await registry.resolve(type);
      for (const name of windowOnly) {
        expect(`${type}/${name}: ${dialect.isAggregateFunction(name)}`).toBe(
          `${type}/${name}: false`
        );
      }
    }
  });

  it('matches function names case-insensitively', async () => {
    const snowflake = await registry.resolve(DataStorageType.SNOWFLAKE);
    expect(snowflake.isAggregateFunction('listagg')).toBe(true);
    expect(snowflake.isAggregateFunction('ListAgg')).toBe(true);
  });

  it('does not classify a scalar function that looks aggregate-ish as an aggregate', async () => {
    for (const type of Object.values(DataStorageType)) {
      const dialect = await registry.resolve(type);
      expect(dialect.isAggregateFunction('GREATEST')).toBe(false);
      expect(dialect.isAggregateFunction('COALESCE')).toBe(false);
    }
  });

  it('tolerates surrounding whitespace on the looked-up name', async () => {
    const dialect = await registry.resolve(DataStorageType.GOOGLE_BIGQUERY);
    expect(dialect.isAggregateFunction(' SUM ')).toBe(true);
  });

  // Lookups trim and upper-case the query name, but the stored list entries never do — a padded
  // or mis-cased list entry would sit in the set as dead data no lookup could ever reach. This
  // keeps that failure mode loud instead of silent.
  it('keeps every dialect name-list entry already trimmed and upper-cased', () => {
    for (const [listName, names] of Object.entries(FORMULA_FUNCTION_DIALECT_NAME_LISTS)) {
      for (const name of names) {
        expect(`${listName}: ${name}`).toBe(`${listName}: ${name.trim().toUpperCase()}`);
      }
    }
  });

  describe('counting aggregates', () => {
    // The list's first cut carried `COUNT_DISTINCT` — the report picklist's spelling, which no
    // warehouse has. It read as coverage while covering nothing, and every counting name a formula
    // CAN spell (COUNTIF, COUNT_IF, APPROX_*, HLL) was missing. A hand-written list is what
    // produced that, so tie it back to the dialect lists it is supposed to describe.
    it('only names aggregates some dialect actually spells', async () => {
      for (const name of FORMULA_COUNTING_FUNCTION_NAMES) {
        const spelledBy = await Promise.all(
          Object.values(DataStorageType).map(async type =>
            (await registry.resolve(type)).isAggregateFunction(name)
          )
        );
        expect(`${name}: ${spelledBy.some(Boolean)}`).toBe(`${name}: true`);
      }
    });

    it('classifies counting and non-counting aggregates', () => {
      for (const name of FORMULA_COUNTING_FUNCTION_NAMES) {
        expect(`${name}: ${isCountingFormulaFunction(name)}`).toBe(`${name}: true`);
      }
      // SUM/AVG/MIN/MAX are NULL over an empty input and must stay that way — coalescing them
      // would report "no data" as a genuine zero.
      for (const name of ['SUM', 'AVG', 'MIN', 'MAX', 'STRING_AGG', 'ANY_VALUE']) {
        expect(`${name}: ${isCountingFormulaFunction(name)}`).toBe(`${name}: false`);
      }
    });

    it('matches counting names case-insensitively, whitespace and all', () => {
      expect(isCountingFormulaFunction(' countif ')).toBe(true);
      expect(isCountingFormulaFunction('CountIf')).toBe(true);
    });
  });

  // A metric sleeve computes these over the joined source's RAW values, exactly as it computes
  // `COUNT(DISTINCT x)` — they ask the same question with no `DISTINCT` keyword to key on, and
  // answering them off the pre-join roll-up instead conflates raw values that roll up alike.
  describe('distinct-counting aggregates', () => {
    it('names only aggregates some dialect actually spells', async () => {
      for (const name of FORMULA_DISTINCT_COUNTING_FUNCTION_NAMES) {
        const spelledBy = await Promise.all(
          Object.values(DataStorageType).map(async type =>
            (await registry.resolve(type)).isAggregateFunction(name)
          )
        );
        expect(`${name}: ${spelledBy.some(Boolean)}`).toBe(`${name}: true`);
      }
    });

    // A distinct-counting aggregate counts, so it must also read an empty join-back as 0 — the two
    // lists are not independent, and one growing without the other is a NULL where 0 belongs.
    it('is a subset of the counting aggregates', () => {
      for (const name of FORMULA_DISTINCT_COUNTING_FUNCTION_NAMES) {
        expect(`${name}: ${isCountingFormulaFunction(name)}`).toBe(`${name}: true`);
      }
    });

    it('classifies row-counting and value aggregates as not distinct-counting', () => {
      // COUNT is absent on purpose: bare `COUNT(x)` counts rows. Its DISTINCT form carries the
      // quantifier, which the sleeve planner reads separately.
      for (const name of ['COUNT', 'COUNTIF', 'COUNT_IF', 'SUM', 'AVG', 'STRING_AGG']) {
        expect(`${name}: ${isDistinctCountingFormulaFunction(name)}`).toBe(`${name}: false`);
      }
      for (const name of FORMULA_DISTINCT_COUNTING_FUNCTION_NAMES) {
        expect(`${name}: ${isDistinctCountingFormulaFunction(name)}`).toBe(`${name}: true`);
      }
    });

    it('matches case-insensitively, whitespace and all', () => {
      expect(isDistinctCountingFormulaFunction(' approx_distinct ')).toBe(true);
    });
  });
});
