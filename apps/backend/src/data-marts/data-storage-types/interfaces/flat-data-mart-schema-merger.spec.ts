import { Logger } from '@nestjs/common';
import { AthenaSchemaMerger } from '../athena/services/athena-schema-merger';
import { AthenaFieldType } from '../athena/enums/athena-field-type.enum';
import { AthenaDataMartSchemaType } from '../athena/schemas/athena-data-mart-schema.schema';
import { DataMartSchemaFieldStatus } from '../enums/data-mart-schema-field-status.enum';
import type { DataMartSchema } from '../data-mart-schema.type';

// FlatDataMartSchemaMerger is abstract; AthenaSchemaMerger exercises its shared
// mergeFlatSchemaFields logic without pulling in any Athena-specific behavior.
describe('FlatDataMartSchemaMerger — calculated fields', () => {
  const merger = new AthenaSchemaMerger();

  const schema = (fields: Record<string, unknown>[]): DataMartSchema =>
    ({ type: AthenaDataMartSchemaType, fields }) as unknown as DataMartSchema;

  it('carries a calculated field through untouched when the warehouse does not return it', () => {
    const existing = schema([
      {
        name: 'clicks',
        type: AthenaFieldType.INTEGER,
        status: DataMartSchemaFieldStatus.CONNECTED,
      },
      {
        name: 'ctr',
        type: AthenaFieldType.FLOAT,
        status: DataMartSchemaFieldStatus.CONNECTED,
        calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
      },
    ]);
    const incoming = schema([
      {
        name: 'clicks',
        type: AthenaFieldType.INTEGER,
        status: DataMartSchemaFieldStatus.CONNECTED,
      },
    ]);

    const merged = merger.mergeSchemas(existing, incoming);

    expect(merged.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'ctr', status: DataMartSchemaFieldStatus.CONNECTED }),
      ])
    );
  });

  it('keeps the calculated field on a name collision with an incoming warehouse column and logs the loss', () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const existing = schema([
      {
        name: 'revenue',
        type: AthenaFieldType.FLOAT,
        status: DataMartSchemaFieldStatus.CONNECTED,
        calculated: { formula: 'SUM({{ref field="net_revenue"}})', level: 'metric' },
      },
    ]);
    const incoming = schema([
      { name: 'revenue', type: AthenaFieldType.FLOAT, status: DataMartSchemaFieldStatus.CONNECTED },
    ]);

    const merged = merger.mergeSchemas(existing, incoming);

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
