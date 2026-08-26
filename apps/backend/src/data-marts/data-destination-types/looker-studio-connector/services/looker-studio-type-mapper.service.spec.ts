import { Test, TestingModule } from '@nestjs/testing';
import { LookerStudioTypeMapperService } from './looker-studio-type-mapper.service';
import { LookerStudioAggregationMapperService } from './looker-studio-aggregation-mapper.service';
import { DataStorageType } from '../../../data-storage-types/enums/data-storage-type.enum';
import { AthenaFieldType } from '../../../data-storage-types/athena/enums/athena-field-type.enum';
import { BigQueryFieldType } from '../../../data-storage-types/bigquery/enums/bigquery-field-type.enum';
import { DatabricksFieldType } from '../../../data-storage-types/databricks/enums/databricks-field-type.enum';
import { RedshiftFieldType } from '../../../data-storage-types/redshift/enums/redshift-field-type.enum';
import { SnowflakeFieldType } from '../../../data-storage-types/snowflake/enums/snowflake-field-type.enum';
import { FieldDataType } from '../enums/field-data-type.enum';
import { FieldConceptType } from '../enums/field-concept-type.enum';
import { AggregationType } from '../enums/aggregation-type.enum';
import { ReportDataHeader } from '../../../dto/domain/report-data-header.dto';
import { StorageFieldType } from '../../../dto/domain/storage-field-type';

describe('LookerStudioTypeMapperService', () => {
  let service: LookerStudioTypeMapperService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LookerStudioTypeMapperService, LookerStudioAggregationMapperService],
    }).compile();

    service = module.get(LookerStudioTypeMapperService);
  });

  describe('mapToLookerStudioDataType — fallbacks', () => {
    it('LEGACY_GOOGLE_BIGQUERY behaves as GOOGLE_BIGQUERY', () => {
      expect(
        service.mapToLookerStudioDataType(
          BigQueryFieldType.INTEGER,
          DataStorageType.LEGACY_GOOGLE_BIGQUERY
        )
      ).toBe(FieldDataType.NUMBER);
      expect(
        service.mapToLookerStudioDataType(
          BigQueryFieldType.TIMESTAMP,
          DataStorageType.LEGACY_GOOGLE_BIGQUERY
        )
      ).toBe(FieldDataType.STRING);
    });
  });

  describe('mapToLookerStudioDataType — exhaustive storage-native coverage', () => {
    type Case = [StorageFieldType, FieldDataType];

    const bigQueryCases: Case[] = [
      [BigQueryFieldType.INTEGER, FieldDataType.NUMBER],
      [BigQueryFieldType.FLOAT, FieldDataType.NUMBER],
      [BigQueryFieldType.NUMERIC, FieldDataType.NUMBER],
      [BigQueryFieldType.BIGNUMERIC, FieldDataType.NUMBER],
      [BigQueryFieldType.BOOLEAN, FieldDataType.BOOLEAN],
      [BigQueryFieldType.STRING, FieldDataType.STRING],
      [BigQueryFieldType.DATE, FieldDataType.STRING],
      [BigQueryFieldType.TIME, FieldDataType.STRING],
      [BigQueryFieldType.DATETIME, FieldDataType.STRING],
      [BigQueryFieldType.TIMESTAMP, FieldDataType.STRING],
      [BigQueryFieldType.BYTES, FieldDataType.STRING],
      [BigQueryFieldType.GEOGRAPHY, FieldDataType.STRING],
      [BigQueryFieldType.JSON, FieldDataType.STRING],
      [BigQueryFieldType.RECORD, FieldDataType.STRING],
      [BigQueryFieldType.STRUCT, FieldDataType.STRING],
      [BigQueryFieldType.RANGE, FieldDataType.STRING],
      [BigQueryFieldType.INTERVAL, FieldDataType.STRING],
    ];

    const snowflakeCases: Case[] = [
      [SnowflakeFieldType.INTEGER, FieldDataType.NUMBER],
      [SnowflakeFieldType.FLOAT, FieldDataType.NUMBER],
      [SnowflakeFieldType.NUMERIC, FieldDataType.NUMBER],
      [SnowflakeFieldType.BOOLEAN, FieldDataType.BOOLEAN],
      [SnowflakeFieldType.STRING, FieldDataType.STRING],
      [SnowflakeFieldType.BYTES, FieldDataType.STRING],
      [SnowflakeFieldType.DATE, FieldDataType.STRING],
      [SnowflakeFieldType.TIME, FieldDataType.STRING],
      [SnowflakeFieldType.TIMESTAMP, FieldDataType.STRING],
      [SnowflakeFieldType.GEOGRAPHY, FieldDataType.STRING],
      [SnowflakeFieldType.VARIANT, FieldDataType.STRING],
    ];

    const redshiftCases: Case[] = [
      [RedshiftFieldType.SMALLINT, FieldDataType.NUMBER],
      [RedshiftFieldType.INTEGER, FieldDataType.NUMBER],
      [RedshiftFieldType.BIGINT, FieldDataType.NUMBER],
      [RedshiftFieldType.DECIMAL, FieldDataType.NUMBER],
      [RedshiftFieldType.NUMERIC, FieldDataType.NUMBER],
      [RedshiftFieldType.REAL, FieldDataType.NUMBER],
      [RedshiftFieldType.DOUBLE_PRECISION, FieldDataType.NUMBER],
      [RedshiftFieldType.BOOLEAN, FieldDataType.BOOLEAN],
      [RedshiftFieldType.BOOL, FieldDataType.BOOLEAN],
      [RedshiftFieldType.VARCHAR, FieldDataType.STRING],
      [RedshiftFieldType.CHAR, FieldDataType.STRING],
      [RedshiftFieldType.TEXT, FieldDataType.STRING],
      [RedshiftFieldType.BPCHAR, FieldDataType.STRING],
      [RedshiftFieldType.DATE, FieldDataType.STRING],
      [RedshiftFieldType.TIMESTAMP, FieldDataType.STRING],
      [RedshiftFieldType.TIMESTAMPTZ, FieldDataType.STRING],
      [RedshiftFieldType.TIME, FieldDataType.STRING],
      [RedshiftFieldType.TIMETZ, FieldDataType.STRING],
      [RedshiftFieldType.BYTEA, FieldDataType.STRING],
      [RedshiftFieldType.SUPER, FieldDataType.STRING],
      [RedshiftFieldType.GEOMETRY, FieldDataType.STRING],
      [RedshiftFieldType.GEOGRAPHY, FieldDataType.STRING],
    ];

    const athenaCases: Case[] = [
      [AthenaFieldType.TINYINT, FieldDataType.NUMBER],
      [AthenaFieldType.SMALLINT, FieldDataType.NUMBER],
      [AthenaFieldType.INTEGER, FieldDataType.NUMBER],
      [AthenaFieldType.BIGINT, FieldDataType.NUMBER],
      [AthenaFieldType.FLOAT, FieldDataType.NUMBER],
      [AthenaFieldType.REAL, FieldDataType.NUMBER],
      [AthenaFieldType.DOUBLE, FieldDataType.NUMBER],
      [AthenaFieldType.DECIMAL, FieldDataType.NUMBER],
      [AthenaFieldType.BOOLEAN, FieldDataType.BOOLEAN],
      [AthenaFieldType.CHAR, FieldDataType.STRING],
      [AthenaFieldType.VARCHAR, FieldDataType.STRING],
      [AthenaFieldType.STRING, FieldDataType.STRING],
      [AthenaFieldType.BINARY, FieldDataType.STRING],
      [AthenaFieldType.VARBINARY, FieldDataType.STRING],
      [AthenaFieldType.DATE, FieldDataType.STRING],
      [AthenaFieldType.TIME, FieldDataType.STRING],
      [AthenaFieldType.TIMESTAMP, FieldDataType.STRING],
      [AthenaFieldType.TIME_WITH_TIME_ZONE, FieldDataType.STRING],
      [AthenaFieldType.TIMESTAMP_WITH_TIME_ZONE, FieldDataType.STRING],
      [AthenaFieldType.INTERVAL_YEAR_TO_MONTH, FieldDataType.STRING],
      [AthenaFieldType.INTERVAL_DAY_TO_SECOND, FieldDataType.STRING],
      [AthenaFieldType.ARRAY, FieldDataType.STRING],
      [AthenaFieldType.MAP, FieldDataType.STRING],
      [AthenaFieldType.STRUCT, FieldDataType.STRING],
      [AthenaFieldType.ROW, FieldDataType.STRING],
      [AthenaFieldType.JSON, FieldDataType.STRING],
    ];

    const databricksCases: Case[] = [
      [DatabricksFieldType.TINYINT, FieldDataType.NUMBER],
      [DatabricksFieldType.SMALLINT, FieldDataType.NUMBER],
      [DatabricksFieldType.INT, FieldDataType.NUMBER],
      [DatabricksFieldType.BIGINT, FieldDataType.NUMBER],
      [DatabricksFieldType.FLOAT, FieldDataType.NUMBER],
      [DatabricksFieldType.DOUBLE, FieldDataType.NUMBER],
      [DatabricksFieldType.DECIMAL, FieldDataType.NUMBER],
      [DatabricksFieldType.BOOLEAN, FieldDataType.BOOLEAN],
      [DatabricksFieldType.STRING, FieldDataType.STRING],
      [DatabricksFieldType.VARCHAR, FieldDataType.STRING],
      [DatabricksFieldType.CHAR, FieldDataType.STRING],
      [DatabricksFieldType.BINARY, FieldDataType.STRING],
      [DatabricksFieldType.DATE, FieldDataType.STRING],
      [DatabricksFieldType.TIMESTAMP, FieldDataType.STRING],
      [DatabricksFieldType.TIMESTAMP_NTZ, FieldDataType.STRING],
      [DatabricksFieldType.INTERVAL, FieldDataType.STRING],
      [DatabricksFieldType.ARRAY, FieldDataType.STRING],
      [DatabricksFieldType.STRUCT, FieldDataType.STRING],
      [DatabricksFieldType.MAP, FieldDataType.STRING],
    ];

    describe.each([
      ['BigQuery', DataStorageType.GOOGLE_BIGQUERY, bigQueryCases],
      ['Snowflake', DataStorageType.SNOWFLAKE, snowflakeCases],
      ['Redshift', DataStorageType.AWS_REDSHIFT, redshiftCases],
      ['Athena', DataStorageType.AWS_ATHENA, athenaCases],
      ['Databricks', DataStorageType.DATABRICKS, databricksCases],
    ] as const)('%s storage', (_label, storageType, cases) => {
      it.each(cases)('%s → %s', (rawType, expected) => {
        expect(service.mapToLookerStudioDataType(rawType, storageType)).toBe(expected);
      });
    });
  });

  describe('buildSchemaField — native fields (no aggregateFunction)', () => {
    it('native NUMBER → METRIC + SUM + reaggregatable=true', () => {
      const header = new ReportDataHeader(
        'revenue',
        'Revenue',
        undefined,
        BigQueryFieldType.INTEGER
      );
      const field = service.buildSchemaField(header, DataStorageType.GOOGLE_BIGQUERY);

      expect(field.dataType).toBe(FieldDataType.NUMBER);
      expect(field.semantics?.conceptType).toBe(FieldConceptType.METRIC);
      expect(field.defaultAggregationType).toBe(AggregationType.SUM);
      expect(field.semantics?.isReaggregatable).toBe(true);
    });

    it('native STRING → DIMENSION, no defaultAggregationType', () => {
      const header = new ReportDataHeader(
        'country',
        'Country',
        undefined,
        BigQueryFieldType.STRING
      );
      const field = service.buildSchemaField(header, DataStorageType.GOOGLE_BIGQUERY);

      expect(field.dataType).toBe(FieldDataType.STRING);
      expect(field.semantics?.conceptType).toBe(FieldConceptType.DIMENSION);
      expect(field.defaultAggregationType).toBeUndefined();
    });

    it('native BOOLEAN → DIMENSION', () => {
      const header = new ReportDataHeader(
        'is_active',
        'Is Active',
        undefined,
        BigQueryFieldType.BOOLEAN
      );
      const field = service.buildSchemaField(header, DataStorageType.GOOGLE_BIGQUERY);

      expect(field.dataType).toBe(FieldDataType.BOOLEAN);
      expect(field.semantics?.conceptType).toBe(FieldConceptType.DIMENSION);
    });

    it('label falls back to name when alias is absent', () => {
      const header = new ReportDataHeader('revenue');
      const field = service.buildSchemaField(header, DataStorageType.GOOGLE_BIGQUERY);

      expect(field.name).toBe('revenue');
      expect(field.label).toBe('revenue');
    });

    it('header without storageFieldType falls back to STRING/DIMENSION', () => {
      const header = new ReportDataHeader('unknown_col', 'Unknown');
      const field = service.buildSchemaField(header, DataStorageType.GOOGLE_BIGQUERY);

      expect(field.dataType).toBe(FieldDataType.STRING);
      expect(field.semantics?.conceptType).toBe(FieldConceptType.DIMENSION);
      expect(field.defaultAggregationType).toBeUndefined();
    });

    it('label uses alias when provided', () => {
      const header = new ReportDataHeader('revenue', 'Total Revenue');
      const field = service.buildSchemaField(header, DataStorageType.GOOGLE_BIGQUERY);

      expect(field.label).toBe('Total Revenue');
    });

    it('description is forwarded when set', () => {
      const header = new ReportDataHeader(
        'revenue',
        undefined,
        'Sum of sales',
        BigQueryFieldType.INTEGER
      );
      const field = service.buildSchemaField(header, DataStorageType.GOOGLE_BIGQUERY);

      expect(field.description).toBe('Sum of sales');
    });
  });

  // A calculated field carries no `aggregateFunction` whatever its level, so the LEVEL is the only
  // thing that tells the two apart here — and this is the seam it has to cross to reach the mapper.
  // Both headers below are byte-identical but for it.
  describe('buildSchemaField — calculated field level', () => {
    it("level 'metric' → METRIC, not re-aggregatable, no defaultAggregationType", () => {
      const header = new ReportDataHeader(
        'ctr',
        'CTR, %',
        undefined,
        BigQueryFieldType.FLOAT,
        undefined,
        'metric'
      );
      const field = service.buildSchemaField(header, DataStorageType.GOOGLE_BIGQUERY);

      expect(field.semantics?.conceptType).toBe(FieldConceptType.METRIC);
      expect(field.semantics?.isReaggregatable).toBe(false);
      expect(field.defaultAggregationType).toBeUndefined();
    });

    // A STRING-typed row-level field: under the old header flag this same field came out METRIC
    // (the flag branch ignored the declared type on purpose), which hid it from Looker's dimension
    // list — the one place a `CONCAT(session_id, user_id)` key is meant to be used.
    it("level 'column' → DIMENSION", () => {
      const header = new ReportDataHeader(
        'session_key',
        'Session Key',
        undefined,
        BigQueryFieldType.STRING,
        undefined,
        'column'
      );
      const field = service.buildSchemaField(header, DataStorageType.GOOGLE_BIGQUERY);

      expect(field.semantics?.conceptType).toBe(FieldConceptType.DIMENSION);
      expect(field.semantics?.isReaggregatable).toBeUndefined();
    });

    // The numeric case, which is where the promise in `.changeset/6732-calculated-fields.md` and
    // in the setup guide was actually broken: a FLOAT-declared `price * quantity` reached Looker as
    // METRIC + defaultAggregationType SUM + re-aggregatable, and Looker summed it over group keys
    // the report's own GROUP BY had already deduplicated.
    it("level 'column' → DIMENSION even for a NUMBER-mapped declared type", () => {
      const header = new ReportDataHeader(
        'line_total',
        'Line total',
        undefined,
        BigQueryFieldType.FLOAT,
        undefined,
        'column'
      );
      const field = service.buildSchemaField(header, DataStorageType.GOOGLE_BIGQUERY);

      expect(field.dataType).toBe(FieldDataType.NUMBER);
      expect(field.semantics?.conceptType).toBe(FieldConceptType.DIMENSION);
      expect(field.semantics?.isReaggregatable).toBeUndefined();
      expect(field.defaultAggregationType).toBeUndefined();
    });
  });

  // `ReportDataHeader[]` is persisted verbatim inside `report_data_cache.dataDescription` and
  // nothing invalidates that cache on a deploy, so during a rolling window an OLD pod can answer
  // getSchema from a row a NEW pod wrote. `calculatedFieldLevel` is the concept's only spelling —
  // this branch introduced it, and no released build reads any marker — so what that old pod does
  // with such a row is exactly this, and no key written beside the level could change it. Pinned
  // so the accepted window stays a decision on record rather than a surprise.
  describe('buildSchemaField — a header with no level, as an older pod sees one', () => {
    it('maps an unmarked FLOAT to a re-summable native metric', () => {
      const header = new ReportDataHeader(
        'ctr',
        'CTR, %',
        undefined,
        BigQueryFieldType.FLOAT,
        undefined,
        undefined
      );
      const field = service.buildSchemaField(header, DataStorageType.GOOGLE_BIGQUERY);

      expect(field.semantics?.conceptType).toBe(FieldConceptType.METRIC);
      expect(field.semantics?.isReaggregatable).toBe(true);
      expect(field.defaultAggregationType).toBe(AggregationType.SUM);
    });
  });

  describe('buildSchemaField — blended fields (with aggregateFunction)', () => {
    it('SUM/INTEGER → METRIC, NUMBER, defaultAgg=SUM, reagg=true', () => {
      const header = new ReportDataHeader(
        'b_revenue',
        'B Revenue',
        undefined,
        BigQueryFieldType.INTEGER,
        'SUM'
      );
      const field = service.buildSchemaField(header, DataStorageType.GOOGLE_BIGQUERY);

      expect(field.dataType).toBe(FieldDataType.NUMBER);
      expect(field.semantics?.conceptType).toBe(FieldConceptType.METRIC);
      expect(field.defaultAggregationType).toBe(AggregationType.SUM);
      expect(field.semantics?.isReaggregatable).toBe(true);
    });

    it('COUNT/INTEGER → METRIC, NUMBER, defaultAgg=SUM, reagg=true', () => {
      const header = new ReportDataHeader(
        'b_count',
        'B Count',
        undefined,
        BigQueryFieldType.INTEGER,
        'COUNT'
      );
      const field = service.buildSchemaField(header, DataStorageType.GOOGLE_BIGQUERY);

      expect(field.dataType).toBe(FieldDataType.NUMBER);
      expect(field.semantics?.conceptType).toBe(FieldConceptType.METRIC);
      expect(field.defaultAggregationType).toBe(AggregationType.SUM);
      expect(field.semantics?.isReaggregatable).toBe(true);
    });

    it('COUNT_DISTINCT/INTEGER → METRIC, NUMBER, no defaultAgg, reagg=false', () => {
      const header = new ReportDataHeader(
        'b_cnt_dist',
        'B Count Distinct',
        undefined,
        BigQueryFieldType.INTEGER,
        'COUNT_DISTINCT'
      );
      const field = service.buildSchemaField(header, DataStorageType.GOOGLE_BIGQUERY);

      expect(field.dataType).toBe(FieldDataType.NUMBER);
      expect(field.semantics?.conceptType).toBe(FieldConceptType.METRIC);
      expect(field.defaultAggregationType).toBeUndefined();
      expect(field.semantics?.isReaggregatable).toBe(false);
    });

    it('STRING_AGG/STRING → DIMENSION, STRING', () => {
      const header = new ReportDataHeader(
        'b_tags',
        'B Tags',
        undefined,
        BigQueryFieldType.STRING,
        'STRING_AGG'
      );
      const field = service.buildSchemaField(header, DataStorageType.GOOGLE_BIGQUERY);

      expect(field.dataType).toBe(FieldDataType.STRING);
      expect(field.semantics?.conceptType).toBe(FieldConceptType.DIMENSION);
    });

    it('ANY_VALUE/INTEGER → DIMENSION, NUMBER', () => {
      const header = new ReportDataHeader(
        'b_any_id',
        'B Any ID',
        undefined,
        BigQueryFieldType.INTEGER,
        'ANY_VALUE'
      );
      const field = service.buildSchemaField(header, DataStorageType.GOOGLE_BIGQUERY);

      expect(field.dataType).toBe(FieldDataType.NUMBER);
      expect(field.semantics?.conceptType).toBe(FieldConceptType.DIMENSION);
    });

    it('MAX/DATE → DIMENSION, STRING (Looker has no DATE)', () => {
      const header = new ReportDataHeader(
        'b_max_date',
        'B Max Date',
        undefined,
        BigQueryFieldType.DATE,
        'MAX'
      );
      const field = service.buildSchemaField(header, DataStorageType.GOOGLE_BIGQUERY);

      expect(field.dataType).toBe(FieldDataType.STRING);
      expect(field.semantics?.conceptType).toBe(FieldConceptType.DIMENSION);
    });

    it('MAX/INTEGER → METRIC, NUMBER, defaultAgg=MAX', () => {
      const header = new ReportDataHeader(
        'b_max_revenue',
        'B Max Revenue',
        undefined,
        BigQueryFieldType.INTEGER,
        'MAX'
      );
      const field = service.buildSchemaField(header, DataStorageType.GOOGLE_BIGQUERY);

      expect(field.dataType).toBe(FieldDataType.NUMBER);
      expect(field.semantics?.conceptType).toBe(FieldConceptType.METRIC);
      expect(field.defaultAggregationType).toBe(AggregationType.MAX);
      expect(field.semantics?.isReaggregatable).toBe(true);
    });

    it('MIN/INTEGER → METRIC, NUMBER, defaultAgg=MIN', () => {
      const header = new ReportDataHeader(
        'b_min_revenue',
        'B Min Revenue',
        undefined,
        BigQueryFieldType.INTEGER,
        'MIN'
      );
      const field = service.buildSchemaField(header, DataStorageType.GOOGLE_BIGQUERY);

      expect(field.dataType).toBe(FieldDataType.NUMBER);
      expect(field.semantics?.conceptType).toBe(FieldConceptType.METRIC);
      expect(field.defaultAggregationType).toBe(AggregationType.MIN);
    });

    it('Databricks COUNT — header carries DatabricksFieldType.INT, returns METRIC/NUMBER', () => {
      const header = new ReportDataHeader(
        'b_count',
        'B Count',
        undefined,
        DatabricksFieldType.INT,
        'COUNT'
      );
      const field = service.buildSchemaField(header, DataStorageType.DATABRICKS);

      expect(field.dataType).toBe(FieldDataType.NUMBER);
      expect(field.semantics?.conceptType).toBe(FieldConceptType.METRIC);
    });

    // End-to-end: the flag `resolveReportDataHeaders` puts on a calculated-metric
    // header has to survive into the Looker schema field, or the connector still advertises a
    // ratio as a summable metric.
    it('calculated field — METRIC, isReaggregatable false, and NO defaultAggregationType', () => {
      const header = new ReportDataHeader(
        'ctr',
        undefined,
        undefined,
        BigQueryFieldType.FLOAT,
        undefined,
        true
      );
      const field = service.buildSchemaField(header, DataStorageType.GOOGLE_BIGQUERY);

      expect(field.dataType).toBe(FieldDataType.NUMBER);
      expect(field.semantics?.conceptType).toBe(FieldConceptType.METRIC);
      expect(field.semantics?.isReaggregatable).toBe(false);
      expect(field.defaultAggregationType).toBeUndefined();
    });

    it('a plain FLOAT column (no flag) still advertises SUM + re-aggregatable', () => {
      const header = new ReportDataHeader('revenue', undefined, undefined, BigQueryFieldType.FLOAT);
      const field = service.buildSchemaField(header, DataStorageType.GOOGLE_BIGQUERY);

      expect(field.defaultAggregationType).toBe(AggregationType.SUM);
      expect(field.semantics?.isReaggregatable).toBe(true);
    });

    it('Redshift STRING_AGG — header carries RedshiftFieldType.VARCHAR, returns DIMENSION/STRING', () => {
      const header = new ReportDataHeader(
        'b_tags',
        'B Tags',
        undefined,
        RedshiftFieldType.VARCHAR,
        'STRING_AGG'
      );
      const field = service.buildSchemaField(header, DataStorageType.AWS_REDSHIFT);

      expect(field.dataType).toBe(FieldDataType.STRING);
      expect(field.semantics?.conceptType).toBe(FieldConceptType.DIMENSION);
    });
  });
});
