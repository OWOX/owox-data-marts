import { BigQuerySchemaMerger } from './bigquery-schema-merger';
import { BigQueryFieldType } from '../enums/bigquery-field-type.enum';
import { BigQueryFieldMode } from '../enums/bigquery-field-mode.enum';
import { DataMartSchemaFieldStatus } from '../../enums/data-mart-schema-field-status.enum';
import { BigQueryDataMartSchemaType } from '../schemas/bigquery-data-mart.schema';
import type { DataMartSchema } from '../../data-mart-schema.type';

describe('BigQuerySchemaMerger — aggregation governance preservation', () => {
  const merger = new BigQuerySchemaMerger();

  const schema = (fields: Record<string, unknown>[]): DataMartSchema =>
    ({ type: BigQueryDataMartSchemaType, fields }) as unknown as DataMartSchema;

  const simpleField = (over: Record<string, unknown> = {}) => ({
    name: 'amount',
    type: BigQueryFieldType.INTEGER,
    mode: BigQueryFieldMode.NULLABLE,
    status: DataMartSchemaFieldStatus.CONNECTED,
    ...over,
  });

  it('keeps an overridden aggregationRole / allowedAggregations on a simple field', () => {
    const existing = schema([
      simpleField({ aggregationRole: 'dimension', allowedAggregations: ['COUNT'] }),
    ]);
    const incoming = schema([simpleField()]);

    const merged = merger.mergeSchemas(existing, incoming) as unknown as {
      fields: Record<string, unknown>[];
    };
    expect(merged.fields[0]).toMatchObject({
      name: 'amount',
      aggregationRole: 'dimension',
      allowedAggregations: ['COUNT'],
    });
  });

  it('preserves the override on a nested RECORD field after re-actualization', () => {
    const existing = schema([
      {
        name: 'metrics',
        type: BigQueryFieldType.RECORD,
        mode: BigQueryFieldMode.NULLABLE,
        status: DataMartSchemaFieldStatus.CONNECTED,
        fields: [
          simpleField({
            name: 'revenue',
            aggregationRole: 'metric',
            allowedAggregations: ['SUM', 'AVG'],
          }),
        ],
      },
    ]);
    const incoming = schema([
      {
        name: 'metrics',
        type: BigQueryFieldType.RECORD,
        mode: BigQueryFieldMode.NULLABLE,
        status: DataMartSchemaFieldStatus.CONNECTED,
        fields: [simpleField({ name: 'revenue' })],
      },
    ]);

    const merged = merger.mergeSchemas(existing, incoming) as unknown as {
      fields: { fields: Record<string, unknown>[] }[];
    };
    expect(merged.fields[0].fields[0]).toMatchObject({
      name: 'revenue',
      aggregationRole: 'metric',
      allowedAggregations: ['SUM', 'AVG'],
    });
  });

  it('preserves an explicit empty allowedAggregations override', () => {
    const existing = schema([simpleField({ allowedAggregations: [] })]);
    const incoming = schema([simpleField({ allowedAggregations: ['SUM'] })]);

    const merged = merger.mergeSchemas(existing, incoming) as unknown as {
      fields: Record<string, unknown>[];
    };
    expect(merged.fields[0].allowedAggregations).toEqual([]);
  });
});
