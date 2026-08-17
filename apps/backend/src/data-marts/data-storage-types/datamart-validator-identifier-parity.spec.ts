import { AthenaDataMartValidator } from './athena/services/athena-datamart.validator';
import { BigQueryDataMartValidator } from './bigquery/services/bigquery-datamart.validator';
import { DatabricksDataMartValidator } from './databricks/services/databricks-datamart.validator';
import { RedshiftDataMartValidator } from './redshift/services/redshift-datamart.validator';
import { SnowflakeDataMartValidator } from './snowflake/services/snowflake-datamart.validator';
import { LegacyBigQueryDataMartValidator } from './bigquery/services/legacy/legacy-bigquery-datamart.validator';
import { validatorProviders } from './data-storage-providers';
import {
  DataMartValidationCode,
  DataMartValidator,
} from './interfaces/data-mart-validator.interface';

/**
 * Every warehouse validator must tag its identifier-format failure with a code.
 * Without one the publish path cannot tell the authored message from raw driver
 * output, so it replaces it with a generic reason — which is how Athena drifted
 * out of parity with the other four.
 *
 * The list is asserted against the registered validator providers, so adding a
 * warehouse without adding it here fails rather than passing silently.
 *
 * Identifiers are checked before config, credentials or an adapter in every
 * validator, so the stub dependencies below are never dereferenced. Redshift
 * was the exception until it was reordered to match.
 */
describe('Data Mart validators — identifier failure parity', () => {
  const validators: [string, DataMartValidator][] = [
    ['athena', new AthenaDataMartValidator(null as never, null as never)],
    ['bigquery', new BigQueryDataMartValidator(null as never, null as never)],
    ['databricks', new DatabricksDataMartValidator(null as never, null as never)],
    ['redshift', new RedshiftDataMartValidator(null as never, null as never)],
    ['snowflake', new SnowflakeDataMartValidator(null as never, null as never)],
    ['legacy-bigquery', new LegacyBigQueryDataMartValidator(null as never, null as never)],
  ];

  it('covers every registered Data Mart validator', () => {
    expect(validators).toHaveLength(validatorProviders.length);
  });

  it.each(validators)('%s codes its invalid-identifier failure', async (_name, validator) => {
    const result = await validator.validate(
      { fullyQualifiedName: 'this is !! not a valid identifier' } as never,
      {} as never,
      {} as never
    );

    expect(result.valid).toBe(false);
    expect(result.errorMessage).toContain('Invalid identifier format');
    expect(result.code).toBe(DataMartValidationCode.INVALID_IDENTIFIER_FORMAT);
  });
});
