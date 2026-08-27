import { describe, expect, it } from 'vitest';
import { DataStorageType } from '../../../../../data-storage';
import { GUARDED_DIVISION_SNIPPET, aggregateFunctionsFor } from './formula-function-dialects';

describe('aggregateFunctionsFor', () => {
  it('offers the shared aggregates plus the storage’s own, sorted', () => {
    const bigquery = aggregateFunctionsFor(DataStorageType.GOOGLE_BIGQUERY);

    expect(bigquery).toContain('SUM');
    expect(bigquery).toContain('COUNTIF');
    expect(bigquery).toEqual([...bigquery].sort((a, b) => a.localeCompare(b)));
  });

  // Every dialect's list is DIFFERENT, and offering another warehouse's spelling is worse than
  // offering nothing: the backend parser does not know it as an aggregate, so the formula's
  // arguments read as bare row-level columns and the save fails with a level-mixing error the
  // analyst has no way to connect to the suggestion they accepted.
  it('never offers a function from another dialect', () => {
    // BOOLAND_AGG is Snowflake's spelling; BOOL_AND is Athena/Redshift/Databricks'.
    expect(aggregateFunctionsFor(DataStorageType.SNOWFLAKE)).toContain('BOOLAND_AGG');
    expect(aggregateFunctionsFor(DataStorageType.SNOWFLAKE)).not.toContain('BOOL_AND');
    expect(aggregateFunctionsFor(DataStorageType.AWS_REDSHIFT)).toContain('BOOL_AND');
    expect(aggregateFunctionsFor(DataStorageType.AWS_REDSHIFT)).not.toContain('BOOLAND_AGG');
    // Redshift's aggregate set lacks the Postgres statistical family the others carry.
    expect(aggregateFunctionsFor(DataStorageType.AWS_REDSHIFT)).not.toContain('CORR');
    expect(aggregateFunctionsFor(DataStorageType.AWS_ATHENA)).toContain('CORR');
    // PERCENTILE_DISC is window-only on Redshift (its aggregate is the two-word
    // `APPROXIMATE PERCENTILE_DISC`), while Snowflake documents it as an aggregate outright.
    expect(aggregateFunctionsFor(DataStorageType.AWS_REDSHIFT)).not.toContain('PERCENTILE_DISC');
    expect(aggregateFunctionsFor(DataStorageType.AWS_REDSHIFT)).toContain('PERCENTILE_CONT');
    expect(aggregateFunctionsFor(DataStorageType.SNOWFLAKE)).toContain('PERCENTILE_DISC');
    // COUNTIF is BigQuery's spelling alone; everyone else underscores it.
    expect(aggregateFunctionsFor(DataStorageType.GOOGLE_BIGQUERY)).not.toContain('COUNT_IF');
    expect(aggregateFunctionsFor(DataStorageType.SNOWFLAKE)).not.toContain('COUNTIF');
  });

  it('offers the shared set alone for an unknown storage rather than guessing a dialect', () => {
    const unknown = aggregateFunctionsFor('SOME_FUTURE_WAREHOUSE');

    expect(unknown).toContain('SUM');
    expect(unknown).not.toContain('COUNTIF');
  });
});

describe('GUARDED_DIVISION_SNIPPET', () => {
  // Decision 6 downgraded unguarded division to a warning on the stated grounds that autocomplete
  // offers the guarded form — and the guard has to be one every supported warehouse accepts, so
  // it is NULLIF, not BigQuery's SAFE_DIVIDE or Snowflake's DIV0.
  it('uses the portable NULLIF guard and leaves both operands as tab stops', () => {
    expect(GUARDED_DIVISION_SNIPPET.insertText).toContain('NULLIF(');
    expect(GUARDED_DIVISION_SNIPPET.insertText).toContain('${1:');
    expect(GUARDED_DIVISION_SNIPPET.insertText).toContain('${2:');
    expect(GUARDED_DIVISION_SNIPPET.insertText).not.toContain('SAFE_DIVIDE');
    expect(GUARDED_DIVISION_SNIPPET.insertText).not.toContain('DIV0');
  });
});
