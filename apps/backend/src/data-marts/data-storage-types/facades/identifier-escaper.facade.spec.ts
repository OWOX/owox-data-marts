import { TypeResolver } from '../../../common/resolver/type-resolver';
import { AthenaIdentifierEscaper } from '../athena/services/athena-identifier.escaper';
import { BigQueryIdentifierEscaper } from '../bigquery/services/bigquery-identifier.escaper';
import { LegacyBigQueryIdentifierEscaper } from '../bigquery/services/legacy/legacy-bigquery-identifier.escaper';
import { DatabricksIdentifierEscaper } from '../databricks/services/databricks-identifier.escaper';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { IdentifierEscaper } from '../interfaces/identifier-escaper.interface';
import { RedshiftIdentifierEscaper } from '../redshift/services/redshift-identifier.escaper';
import { SnowflakeIdentifierEscaper } from '../snowflake/services/snowflake-identifier.escaper';
import { IdentifierEscaperFacade } from './identifier-escaper.facade';

describe('IdentifierEscaperFacade', () => {
  const facade = new IdentifierEscaperFacade(
    new TypeResolver<DataStorageType, IdentifierEscaper>([
      new BigQueryIdentifierEscaper(),
      new LegacyBigQueryIdentifierEscaper(),
      new AthenaIdentifierEscaper(),
      new SnowflakeIdentifierEscaper(),
      new RedshiftIdentifierEscaper(),
      new DatabricksIdentifierEscaper(),
    ])
  );

  const fqn = 'test-project.TestDataset.dashed-table-name';

  it.each([
    [DataStorageType.GOOGLE_BIGQUERY, '`test-project`.`TestDataset`.`dashed-table-name`'],
    [DataStorageType.LEGACY_GOOGLE_BIGQUERY, '`test-project`.`TestDataset`.`dashed-table-name`'],
    [DataStorageType.AWS_ATHENA, '"test-project"."TestDataset"."dashed-table-name"'],
    [DataStorageType.AWS_REDSHIFT, '"test-project"."TestDataset"."dashed-table-name"'],
    [DataStorageType.DATABRICKS, '`test-project`.`TestDataset`.`dashed-table-name`'],
    [DataStorageType.SNOWFLAKE, '"test-project"."TestDataset"."dashed-table-name"'],
  ])('escapes a dashed fully qualified name for %s', async (type, expected) => {
    await expect(facade.escapeIdentifier(type, fqn)).resolves.toBe(expected);
  });

  it('keeps a valid unquoted Snowflake database part unquoted', async () => {
    await expect(
      facade.escapeIdentifier(DataStorageType.SNOWFLAKE, 'test_db.TestDataset.dashed-table-name')
    ).resolves.toBe('test_db."TestDataset"."dashed-table-name"');
  });

  it('does not double-quote already escaped parts', async () => {
    await expect(
      facade.escapeIdentifier(DataStorageType.GOOGLE_BIGQUERY, '`test-project`.TestDataset.`table`')
    ).resolves.toBe('`test-project`.`TestDataset`.`table`');
  });

  it('throws for an unregistered storage type', async () => {
    await expect(facade.escapeIdentifier('UNKNOWN' as DataStorageType, fqn)).rejects.toThrow(
      'No component found for type'
    );
  });
});
