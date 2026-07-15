import { computeEffectiveType, integerTypeFor } from './field-aggregation';
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

  describe('AVG yields storage-specific float type (average of integers is fractional)', () => {
    it.each([
      [DataStorageType.GOOGLE_BIGQUERY, BigQueryFieldType.INTEGER, BigQueryFieldType.FLOAT],
      [DataStorageType.LEGACY_GOOGLE_BIGQUERY, BigQueryFieldType.INTEGER, BigQueryFieldType.FLOAT],
      [DataStorageType.AWS_ATHENA, AthenaFieldType.INTEGER, AthenaFieldType.DOUBLE],
      [DataStorageType.SNOWFLAKE, SnowflakeFieldType.INTEGER, SnowflakeFieldType.FLOAT],
      [DataStorageType.AWS_REDSHIFT, RedshiftFieldType.INTEGER, RedshiftFieldType.DOUBLE_PRECISION],
      [DataStorageType.DATABRICKS, DatabricksFieldType.INT, DatabricksFieldType.DOUBLE],
    ])('AVG in %s → %s', (storageType, rawType, expected) => {
      expect(computeEffectiveType(rawType, 'AVG', storageType)).toBe(expected);
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

  describe('percentile aggregations yield storage-specific float type', () => {
    it.each([
      [DataStorageType.GOOGLE_BIGQUERY, BigQueryFieldType.INTEGER, BigQueryFieldType.FLOAT],
      [DataStorageType.LEGACY_GOOGLE_BIGQUERY, BigQueryFieldType.INTEGER, BigQueryFieldType.FLOAT],
      [DataStorageType.AWS_ATHENA, AthenaFieldType.INTEGER, AthenaFieldType.DOUBLE],
      [DataStorageType.SNOWFLAKE, SnowflakeFieldType.INTEGER, SnowflakeFieldType.FLOAT],
      [DataStorageType.AWS_REDSHIFT, RedshiftFieldType.INTEGER, RedshiftFieldType.DOUBLE_PRECISION],
      [DataStorageType.DATABRICKS, DatabricksFieldType.INT, DatabricksFieldType.DOUBLE],
    ])('P50 in %s → %s', (storageType, rawType, expected) => {
      expect(computeEffectiveType(rawType, 'P50', storageType)).toBe(expected);
    });

    it('P25 in BigQuery → FLOAT', () => {
      expect(
        computeEffectiveType(BigQueryFieldType.INTEGER, 'P25', DataStorageType.GOOGLE_BIGQUERY)
      ).toBe(BigQueryFieldType.FLOAT);
    });
    it('P75 in BigQuery → FLOAT', () => {
      expect(
        computeEffectiveType(BigQueryFieldType.INTEGER, 'P75', DataStorageType.GOOGLE_BIGQUERY)
      ).toBe(BigQueryFieldType.FLOAT);
    });
    it('P95 in BigQuery → FLOAT', () => {
      expect(
        computeEffectiveType(BigQueryFieldType.INTEGER, 'P95', DataStorageType.GOOGLE_BIGQUERY)
      ).toBe(BigQueryFieldType.FLOAT);
    });
  });
});

// AVG/percentile widen to the storage float type via the (private) getFloatType switch.
// It must be exhaustive: every current storage type resolves a defined float type, and an
// unhandled (future) storage type must fail loudly, not silently return undefined.
describe('float-type resolution is exhaustive (getFloatType via AVG)', () => {
  it.each(Object.values(DataStorageType))('returns a defined float type for %s', storageType => {
    const result = computeEffectiveType(
      BigQueryFieldType.INTEGER,
      'AVG',
      storageType as DataStorageType
    );
    expect(result).toBeDefined();
  });

  it('throws for an unhandled storage type instead of returning undefined', () => {
    expect(() =>
      computeEffectiveType(BigQueryFieldType.INTEGER, 'AVG', 'NOT_A_STORAGE' as DataStorageType)
    ).toThrow();
  });
});

describe('integerTypeFor (Row Count header type)', () => {
  it.each([
    [DataStorageType.GOOGLE_BIGQUERY, BigQueryFieldType.INTEGER],
    [DataStorageType.LEGACY_GOOGLE_BIGQUERY, BigQueryFieldType.INTEGER],
    [DataStorageType.AWS_ATHENA, AthenaFieldType.INTEGER],
    [DataStorageType.SNOWFLAKE, SnowflakeFieldType.INTEGER],
    [DataStorageType.AWS_REDSHIFT, RedshiftFieldType.INTEGER],
    [DataStorageType.DATABRICKS, DatabricksFieldType.INT],
  ])('returns the integer type for %s', (storageType, expected) => {
    expect(integerTypeFor(storageType)).toBe(expected);
  });
});

// COUNT/COUNT_DISTINCT widen to the storage integer type via the exported integerTypeFor
// switch. It must be exhaustive just like getFloatType: every current storage type resolves
// a defined integer type, and an unhandled (future) storage type must fail loudly, not
// silently return undefined.
describe('integer-type resolution is exhaustive (integerTypeFor)', () => {
  it.each(Object.values(DataStorageType))('returns a defined integer type for %s', storageType => {
    const result = integerTypeFor(storageType as DataStorageType);
    expect(result).toBeDefined();
  });

  it('throws for an unhandled storage type instead of returning undefined', () => {
    expect(() => integerTypeFor('NOT_A_STORAGE' as DataStorageType)).toThrow();
  });
});

// STRING_AGG widens to the storage string type via the (private) getStringType switch. It
// must be exhaustive just like getFloatType: every current storage type resolves a defined
// string type, and an unhandled (future) storage type must fail loudly, not silently return
// undefined.
describe('string-type resolution is exhaustive (getStringType via STRING_AGG)', () => {
  it.each(Object.values(DataStorageType))('returns a defined string type for %s', storageType => {
    const result = computeEffectiveType(
      BigQueryFieldType.STRING,
      'STRING_AGG',
      storageType as DataStorageType
    );
    expect(result).toBeDefined();
  });

  it('throws for an unhandled storage type instead of returning undefined', () => {
    expect(() =>
      computeEffectiveType(
        BigQueryFieldType.STRING,
        'STRING_AGG',
        'NOT_A_STORAGE' as DataStorageType
      )
    ).toThrow();
  });
});
