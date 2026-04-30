import { computeEffectiveType } from './field-aggregation';
import { DataStorageType } from './enums/data-storage-type.enum';
import { BigQueryFieldType } from './bigquery/enums/bigquery-field-type.enum';
import { AthenaFieldType } from './athena/enums/athena-field-type.enum';
import { SnowflakeFieldType } from './snowflake/enums/snowflake-field-type.enum';
import { RedshiftFieldType } from './redshift/enums/redshift-field-type.enum';
import { DatabricksFieldType } from './databricks/enums/databricks-field-type.enum';

describe('computeEffectiveType', () => {
  describe('passes raw type through when no aggregation', () => {
    it('undefined aggFunc returns rawType as-is', () => {
      expect(
        computeEffectiveType(BigQueryFieldType.STRING, undefined, DataStorageType.GOOGLE_BIGQUERY)
      ).toBe(BigQueryFieldType.STRING);
      expect(
        computeEffectiveType(SnowflakeFieldType.INTEGER, undefined, DataStorageType.SNOWFLAKE)
      ).toBe(SnowflakeFieldType.INTEGER);
    });
  });

  describe('passes raw type through for SUM/MIN/MAX/ANY_VALUE', () => {
    it('SUM on INTEGER → INTEGER', () => {
      expect(
        computeEffectiveType(BigQueryFieldType.INTEGER, 'SUM', DataStorageType.GOOGLE_BIGQUERY)
      ).toBe(BigQueryFieldType.INTEGER);
    });

    it('MAX on DATE → DATE', () => {
      expect(
        computeEffectiveType(BigQueryFieldType.DATE, 'MAX', DataStorageType.GOOGLE_BIGQUERY)
      ).toBe(BigQueryFieldType.DATE);
    });

    it('MIN on FLOAT → FLOAT', () => {
      expect(computeEffectiveType(SnowflakeFieldType.FLOAT, 'MIN', DataStorageType.SNOWFLAKE)).toBe(
        SnowflakeFieldType.FLOAT
      );
    });

    it('ANY_VALUE on INTEGER → INTEGER', () => {
      expect(
        computeEffectiveType(RedshiftFieldType.INTEGER, 'ANY_VALUE', DataStorageType.AWS_REDSHIFT)
      ).toBe(RedshiftFieldType.INTEGER);
    });
  });

  describe('COUNT and COUNT_DISTINCT yield storage-specific integer type', () => {
    it.each([
      [DataStorageType.GOOGLE_BIGQUERY, BigQueryFieldType.STRING, BigQueryFieldType.INTEGER],
      [DataStorageType.LEGACY_GOOGLE_BIGQUERY, BigQueryFieldType.STRING, BigQueryFieldType.INTEGER],
      [DataStorageType.AWS_ATHENA, AthenaFieldType.STRING, AthenaFieldType.INTEGER],
      [DataStorageType.SNOWFLAKE, SnowflakeFieldType.STRING, SnowflakeFieldType.INTEGER],
      [DataStorageType.AWS_REDSHIFT, RedshiftFieldType.VARCHAR, RedshiftFieldType.INTEGER],
      [DataStorageType.DATABRICKS, DatabricksFieldType.STRING, DatabricksFieldType.INT],
    ])('COUNT in %s → %s', (storageType, rawType, expected) => {
      expect(computeEffectiveType(rawType, 'COUNT', storageType)).toBe(expected);
    });

    it.each([
      [DataStorageType.GOOGLE_BIGQUERY, BigQueryFieldType.STRING, BigQueryFieldType.INTEGER],
      [DataStorageType.LEGACY_GOOGLE_BIGQUERY, BigQueryFieldType.STRING, BigQueryFieldType.INTEGER],
      [DataStorageType.AWS_ATHENA, AthenaFieldType.STRING, AthenaFieldType.INTEGER],
      [DataStorageType.SNOWFLAKE, SnowflakeFieldType.STRING, SnowflakeFieldType.INTEGER],
      [DataStorageType.AWS_REDSHIFT, RedshiftFieldType.VARCHAR, RedshiftFieldType.INTEGER],
      [DataStorageType.DATABRICKS, DatabricksFieldType.STRING, DatabricksFieldType.INT],
    ])('COUNT_DISTINCT in %s → %s', (storageType, rawType, expected) => {
      expect(computeEffectiveType(rawType, 'COUNT_DISTINCT', storageType)).toBe(expected);
    });
  });

  describe('STRING_AGG yields storage-specific string type', () => {
    it.each([
      [DataStorageType.GOOGLE_BIGQUERY, BigQueryFieldType.STRING, BigQueryFieldType.STRING],
      [DataStorageType.LEGACY_GOOGLE_BIGQUERY, BigQueryFieldType.STRING, BigQueryFieldType.STRING],
      [DataStorageType.AWS_ATHENA, AthenaFieldType.STRING, AthenaFieldType.STRING],
      [DataStorageType.SNOWFLAKE, SnowflakeFieldType.STRING, SnowflakeFieldType.STRING],
      [DataStorageType.AWS_REDSHIFT, RedshiftFieldType.VARCHAR, RedshiftFieldType.VARCHAR],
      [DataStorageType.DATABRICKS, DatabricksFieldType.STRING, DatabricksFieldType.STRING],
    ])('STRING_AGG in %s → %s', (storageType, rawType, expected) => {
      expect(computeEffectiveType(rawType, 'STRING_AGG', storageType)).toBe(expected);
    });
  });
});
