import type { DataMartSchema } from '../../data-storage-types/data-mart-schema.type';
import { DataMartSchemaFieldStatus } from '../../data-storage-types/enums/data-mart-schema-field-status.enum';
import {
  buildOutputSchemaFieldTypesValue,
  classifyOutputSchemaFieldTypes,
  sourceReadsOutputSchemaFieldTypes,
} from './output-schema-field-types';

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

describe('buildOutputSchemaFieldTypesValue', () => {
  it('passes the field classes and infers unlisted columns when the Output Schema exists', () => {
    expect(
      JSON.parse(
        buildOutputSchemaFieldTypesValue({
          schema: schemaWith([{ name: 'date', type: 'DATE' }]),
          hasImportedBefore: true,
        }) as string
      )
    ).toEqual({ fields: { date: 'DATE' }, unlistedColumns: 'INFER' });
  });

  it('keeps every column as it is when a Data Mart imported before without an Output Schema', () => {
    expect(
      JSON.parse(
        buildOutputSchemaFieldTypesValue({ schema: null, hasImportedBefore: true }) as string
      )
    ).toEqual({ fields: {}, unlistedColumns: 'KEEP' });
  });

  it('is unset for a new Data Mart', () => {
    expect(
      buildOutputSchemaFieldTypesValue({ schema: null, hasImportedBefore: false })
    ).toBeUndefined();
  });
});

describe('sourceReadsOutputSchemaFieldTypes', () => {
  it('is true only for bundled sources that declare it', () => {
    expect(sourceReadsOutputSchemaFieldTypes('GoogleSheets')).toBe(true);
    expect(sourceReadsOutputSchemaFieldTypes('FacebookMarketing')).toBe(false);
    expect(sourceReadsOutputSchemaFieldTypes('NoSuchConnector')).toBe(false);
  });
});
