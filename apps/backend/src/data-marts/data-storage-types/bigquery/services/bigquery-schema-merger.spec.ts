import { Logger } from '@nestjs/common';
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

  it('carries a top-level calculated field through untouched when the warehouse does not return it', () => {
    const existing = schema([
      simpleField({ name: 'clicks' }),
      simpleField({
        name: 'ctr',
        calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
      }),
    ]);
    const incoming = schema([simpleField({ name: 'clicks' })]);

    const merged = merger.mergeSchemas(existing, incoming) as unknown as {
      fields: Record<string, unknown>[];
    };
    expect(merged.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'ctr', status: DataMartSchemaFieldStatus.CONNECTED }),
      ])
    );
  });

  it('carries a calculated field through untouched at a nested RECORD level', () => {
    const existing = schema([
      {
        name: 'metrics',
        type: BigQueryFieldType.RECORD,
        mode: BigQueryFieldMode.NULLABLE,
        status: DataMartSchemaFieldStatus.CONNECTED,
        fields: [
          simpleField({ name: 'revenue' }),
          simpleField({
            name: 'ctr',
            calculated: { formula: 'SUM({{ref field="revenue"}})', level: 'metric' },
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
    expect(merged.fields[0].fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'ctr', status: DataMartSchemaFieldStatus.CONNECTED }),
      ])
    );
  });

  it('keeps the calculated field on a name collision with an incoming warehouse column and logs the loss', () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const existing = schema([
      simpleField({
        name: 'revenue',
        calculated: { formula: 'SUM({{ref field="net_revenue"}})', level: 'metric' },
      }),
    ]);
    const incoming = schema([simpleField({ name: 'revenue' })]);

    const merged = merger.mergeSchemas(existing, incoming) as unknown as {
      fields: Record<string, unknown>[];
    };

    // The calculated field keeps the name — no second "revenue" field appears, and the field
    // that does survive is still the calculated declaration, not the warehouse column.
    expect(merged.fields).toHaveLength(1);
    expect(merged.fields[0]).toMatchObject({
      name: 'revenue',
      calculated: { formula: 'SUM({{ref field="net_revenue"}})', level: 'metric' },
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('revenue'));

    warnSpy.mockRestore();
  });
});
