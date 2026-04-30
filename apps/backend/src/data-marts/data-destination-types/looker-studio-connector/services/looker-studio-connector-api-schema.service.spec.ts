import { Test, TestingModule } from '@nestjs/testing';
import { LookerStudioConnectorApiSchemaService } from './looker-studio-connector-api-schema.service';
import { LookerStudioTypeMapperService } from './looker-studio-type-mapper.service';
import { LookerStudioAggregationMapperService } from './looker-studio-aggregation-mapper.service';
import { DataMartService } from '../../../services/data-mart.service';
import { DataStorageType } from '../../../data-storage-types/enums/data-storage-type.enum';
import { BigQueryFieldType } from '../../../data-storage-types/bigquery/enums/bigquery-field-type.enum';
import { ReportDataHeader } from '../../../dto/domain/report-data-header.dto';
import { FieldDataType } from '../enums/field-data-type.enum';
import { FieldConceptType } from '../enums/field-concept-type.enum';
import { AggregationType } from '../enums/aggregation-type.enum';

describe('LookerStudioConnectorApiSchemaService.getSchemaFields', () => {
  let service: LookerStudioConnectorApiSchemaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LookerStudioConnectorApiSchemaService,
        LookerStudioTypeMapperService,
        LookerStudioAggregationMapperService,
        {
          provide: DataMartService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get(LookerStudioConnectorApiSchemaService);
  });

  const storageType = DataStorageType.GOOGLE_BIGQUERY;

  it('native NUMBER → METRIC + SUM + reaggregatable=true', () => {
    const headers = [
      new ReportDataHeader('revenue', 'Revenue', undefined, BigQueryFieldType.INTEGER),
    ];
    const [field] = service.getSchemaFields(headers, storageType);

    expect(field.dataType).toBe(FieldDataType.NUMBER);
    expect(field.semantics?.conceptType).toBe(FieldConceptType.METRIC);
    expect(field.defaultAggregationType).toBe(AggregationType.SUM);
    expect(field.semantics?.isReaggregatable).toBe(true);
  });

  it('native STRING → DIMENSION, no defaultAggregationType', () => {
    const headers = [
      new ReportDataHeader('country', 'Country', undefined, BigQueryFieldType.STRING),
    ];
    const [field] = service.getSchemaFields(headers, storageType);

    expect(field.dataType).toBe(FieldDataType.STRING);
    expect(field.semantics?.conceptType).toBe(FieldConceptType.DIMENSION);
    expect(field.defaultAggregationType).toBeUndefined();
  });

  it('blended COUNT/STRING (effective type=INTEGER) → METRIC, NUMBER, defaultAgg=SUM, reagg=true', () => {
    const headers = [
      new ReportDataHeader('b_count', 'B Count', undefined, BigQueryFieldType.INTEGER, 'COUNT'),
    ];
    const [field] = service.getSchemaFields(headers, storageType);

    expect(field.dataType).toBe(FieldDataType.NUMBER);
    expect(field.semantics?.conceptType).toBe(FieldConceptType.METRIC);
    expect(field.defaultAggregationType).toBe(AggregationType.SUM);
    expect(field.semantics?.isReaggregatable).toBe(true);
  });

  it('blended COUNT_DISTINCT/STRING (effective type=INTEGER) → METRIC, NUMBER, no defaultAgg, reagg=false', () => {
    const headers = [
      new ReportDataHeader(
        'b_cnt_dist',
        'B Cnt Dist',
        undefined,
        BigQueryFieldType.INTEGER,
        'COUNT_DISTINCT'
      ),
    ];
    const [field] = service.getSchemaFields(headers, storageType);

    expect(field.dataType).toBe(FieldDataType.NUMBER);
    expect(field.semantics?.conceptType).toBe(FieldConceptType.METRIC);
    expect(field.defaultAggregationType).toBeUndefined();
    expect(field.semantics?.isReaggregatable).toBe(false);
  });

  it('blended STRING_AGG (effective type=STRING) → DIMENSION, STRING', () => {
    const headers = [
      new ReportDataHeader('b_tags', 'B Tags', undefined, BigQueryFieldType.STRING, 'STRING_AGG'),
    ];
    const [field] = service.getSchemaFields(headers, storageType);

    expect(field.dataType).toBe(FieldDataType.STRING);
    expect(field.semantics?.conceptType).toBe(FieldConceptType.DIMENSION);
  });

  it('blended ANY_VALUE/INTEGER (effective type=INTEGER) → DIMENSION, NUMBER', () => {
    const headers = [
      new ReportDataHeader(
        'b_any_id',
        'B Any Id',
        undefined,
        BigQueryFieldType.INTEGER,
        'ANY_VALUE'
      ),
    ];
    const [field] = service.getSchemaFields(headers, storageType);

    expect(field.dataType).toBe(FieldDataType.NUMBER);
    expect(field.semantics?.conceptType).toBe(FieldConceptType.DIMENSION);
  });

  it('blended MAX/DATE (effective type=DATE → STRING in Looker) → DIMENSION, STRING', () => {
    const headers = [
      new ReportDataHeader('b_max_date', 'B Max Date', undefined, BigQueryFieldType.DATE, 'MAX'),
    ];
    const [field] = service.getSchemaFields(headers, storageType);

    expect(field.dataType).toBe(FieldDataType.STRING);
    expect(field.semantics?.conceptType).toBe(FieldConceptType.DIMENSION);
  });

  it('blended MAX/INTEGER → METRIC, NUMBER, defaultAgg=MAX', () => {
    const headers = [
      new ReportDataHeader('b_max_rev', 'B Max Rev', undefined, BigQueryFieldType.INTEGER, 'MAX'),
    ];
    const [field] = service.getSchemaFields(headers, storageType);

    expect(field.dataType).toBe(FieldDataType.NUMBER);
    expect(field.semantics?.conceptType).toBe(FieldConceptType.METRIC);
    expect(field.defaultAggregationType).toBe(AggregationType.MAX);
  });

  it('blended SUM/INTEGER → METRIC, NUMBER, defaultAgg=SUM, reagg=true', () => {
    const headers = [
      new ReportDataHeader('b_sum_rev', 'B Sum Rev', undefined, BigQueryFieldType.INTEGER, 'SUM'),
    ];
    const [field] = service.getSchemaFields(headers, storageType);

    expect(field.dataType).toBe(FieldDataType.NUMBER);
    expect(field.semantics?.conceptType).toBe(FieldConceptType.METRIC);
    expect(field.defaultAggregationType).toBe(AggregationType.SUM);
    expect(field.semantics?.isReaggregatable).toBe(true);
  });
});
