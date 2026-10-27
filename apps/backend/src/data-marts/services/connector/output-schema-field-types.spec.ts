import type { DataMartSchema } from '../../data-storage-types/data-mart-schema.type';
import { classifyOutputSchemaFieldTypes } from './output-schema-field-types';

const schemaWith = (fields: Array<Record<string, unknown>>) =>
  ({ type: 'test-schema', fields }) as unknown as DataMartSchema;

describe('classifyOutputSchemaFieldTypes', () => {
  it('classifies the date and date-time types of every storage', () => {
    const classes = classifyOutputSchemaFieldTypes(
      schemaWith([
        { name: 'bigquery_date', type: 'DATE' },
        { name: 'bigquery_datetime', type: 'DATETIME' },
        { name: 'bigquery_timestamp', type: 'TIMESTAMP' },
        { name: 'athena_date', type: 'date' },
        { name: 'athena_timestamp', type: 'timestamp with time zone' },
        { name: 'snowflake_ntz', type: 'TIMESTAMP_NTZ' },
        { name: 'snowflake_tz', type: 'TIMESTAMP_TZ' },
        { name: 'snowflake_ltz', type: 'TIMESTAMP_LTZ' },
        { name: 'redshift_tz', type: 'TIMESTAMPTZ' },
      ])
    );

    expect(classes).toEqual({
      bigquery_date: 'DATE',
      bigquery_datetime: 'DATETIME',
      bigquery_timestamp: 'DATETIME',
      athena_date: 'DATE',
      athena_timestamp: 'DATETIME',
      snowflake_ntz: 'DATETIME',
      snowflake_tz: 'DATETIME',
      snowflake_ltz: 'DATETIME',
      redshift_tz: 'DATETIME',
    });
  });

  it('classifies text, numbers and time of day as OTHER', () => {
    expect(
      classifyOutputSchemaFieldTypes(
        schemaWith([
          { name: 'title', type: 'STRING' },
          { name: 'amount', type: 'FLOAT' },
          { name: 'starts_at', type: 'TIME' },
          { name: 'payload', type: 'RECORD', fields: [{ name: 'day', type: 'DATE' }] },
        ])
      )
    ).toEqual({ title: 'OTHER', amount: 'OTHER', starts_at: 'OTHER', payload: 'OTHER' });
  });

  it('leaves out calculated fields, which have no warehouse column', () => {
    expect(
      classifyOutputSchemaFieldTypes(
        schemaWith([
          { name: 'date', type: 'DATE' },
          {
            name: 'next_day',
            type: 'DATE',
            calculated: { formula: 'DATE_ADD(date, INTERVAL 1 DAY)', level: 'row' },
          },
        ])
      )
    ).toEqual({ date: 'DATE' });
  });
});
