import type { DataMartSchema } from '../../data-storage-types/data-mart-schema.type';
import { DataMartSchemaFieldStatus } from '../../data-storage-types/enums/data-mart-schema-field-status.enum';
import { classifyOutputSchemaFieldTypes } from './output-schema-field-types';

const schemaWith = (fields: Array<Record<string, unknown>>) =>
  ({ type: 'test-schema', fields }) as unknown as DataMartSchema;

describe('classifyOutputSchemaFieldTypes', () => {
  it('classifies DATE, in any storage spelling, as DATE', () => {
    expect(
      classifyOutputSchemaFieldTypes(
        schemaWith([
          { name: 'bigquery_date', type: 'DATE' },
          { name: 'athena_date', type: 'date' },
        ])
      )
    ).toEqual({ bigquery_date: 'DATE', athena_date: 'DATE' });
  });

  it('classifies date-time, time, text and number types as OTHER', () => {
    expect(
      classifyOutputSchemaFieldTypes(
        schemaWith([
          { name: 'bigquery_datetime', type: 'DATETIME' },
          { name: 'bigquery_timestamp', type: 'TIMESTAMP' },
          { name: 'snowflake_ntz', type: 'TIMESTAMP_NTZ' },
          { name: 'starts_at', type: 'TIME' },
          { name: 'title', type: 'STRING' },
          { name: 'amount', type: 'FLOAT' },
          { name: 'payload', type: 'RECORD', fields: [{ name: 'day', type: 'DATE' }] },
        ])
      )
    ).toEqual({
      bigquery_datetime: 'OTHER',
      bigquery_timestamp: 'OTHER',
      snowflake_ntz: 'OTHER',
      starts_at: 'OTHER',
      title: 'OTHER',
      amount: 'OTHER',
      payload: 'OTHER',
    });
  });

  it('leaves out calculated and disconnected fields, which have no warehouse column', () => {
    expect(
      classifyOutputSchemaFieldTypes(
        schemaWith([
          { name: 'date', type: 'DATE', status: DataMartSchemaFieldStatus.CONNECTED },
          {
            name: 'next_day',
            type: 'DATE',
            calculated: { formula: 'DATE_ADD(date, INTERVAL 1 DAY)', level: 'row' },
          },
          { name: 'removed', type: 'DATE', status: DataMartSchemaFieldStatus.DISCONNECTED },
        ])
      )
    ).toEqual({ date: 'DATE' });
  });
});
