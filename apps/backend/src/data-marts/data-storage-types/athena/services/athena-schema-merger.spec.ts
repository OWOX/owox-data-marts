import { AthenaSchemaMerger } from './athena-schema-merger';
import { AthenaFieldType } from '../enums/athena-field-type.enum';
import { DataMartSchemaFieldStatus } from '../../enums/data-mart-schema-field-status.enum';
import { AthenaDataMartSchemaType } from '../schemas/athena-data-mart-schema.schema';
import type { DataMartSchema } from '../../data-mart-schema.type';

describe('AthenaSchemaMerger — aggregation governance preservation', () => {
  const merger = new AthenaSchemaMerger();

  const schema = (fields: Record<string, unknown>[]): DataMartSchema =>
    ({ type: AthenaDataMartSchemaType, fields }) as unknown as DataMartSchema;

  it('keeps an overridden aggregationRole / allowedAggregations after re-actualization', () => {
    const existing = schema([
      {
        name: 'amount',
        type: AthenaFieldType.INTEGER,
        aggregationRole: 'dimension',
        allowedAggregations: ['COUNT'],
        status: DataMartSchemaFieldStatus.CONNECTED,
      },
    ]);
    // Incoming actualized schema lacks the governance overrides.
    const incoming = schema([
      {
        name: 'amount',
        type: AthenaFieldType.INTEGER,
        status: DataMartSchemaFieldStatus.CONNECTED,
      },
    ]);

    const merged = merger.mergeSchemas(existing, incoming) as unknown as {
      fields: Record<string, unknown>[];
    };
    expect(merged.fields[0]).toMatchObject({
      name: 'amount',
      aggregationRole: 'dimension',
      allowedAggregations: ['COUNT'],
    });
  });

  it('takes the incoming governance when the existing field has none', () => {
    const existing = schema([
      {
        name: 'amount',
        type: AthenaFieldType.INTEGER,
        status: DataMartSchemaFieldStatus.CONNECTED,
      },
    ]);
    const incoming = schema([
      {
        name: 'amount',
        type: AthenaFieldType.INTEGER,
        aggregationRole: 'metric',
        allowedAggregations: ['SUM'],
        status: DataMartSchemaFieldStatus.CONNECTED,
      },
    ]);

    const merged = merger.mergeSchemas(existing, incoming) as unknown as {
      fields: Record<string, unknown>[];
    };
    expect(merged.fields[0]).toMatchObject({
      aggregationRole: 'metric',
      allowedAggregations: ['SUM'],
    });
  });

  it('preserves an explicit empty allowedAggregations override (no functions allowed)', () => {
    const existing = schema([
      {
        name: 'amount',
        type: AthenaFieldType.INTEGER,
        allowedAggregations: [],
        status: DataMartSchemaFieldStatus.CONNECTED,
      },
    ]);
    const incoming = schema([
      {
        name: 'amount',
        type: AthenaFieldType.INTEGER,
        allowedAggregations: ['SUM'],
        status: DataMartSchemaFieldStatus.CONNECTED,
      },
    ]);

    const merged = merger.mergeSchemas(existing, incoming) as unknown as {
      fields: Record<string, unknown>[];
    };
    expect(merged.fields[0].allowedAggregations).toEqual([]);
  });
});
