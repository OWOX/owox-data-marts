import { describe, expect, it } from 'vitest';
import { DataMartSchemaFieldStatus, type DataMartSchema } from '../types/data-mart-schema.types';
import { describeSchemaFieldSummary, summarizeSchemaFields } from './schema-field-summary';

const schemaWith = (fields: unknown[]): DataMartSchema =>
  ({ type: 'bigquery-data-mart-schema', fields }) as unknown as DataMartSchema;

describe('summarizeSchemaFields', () => {
  it('returns an empty summary for a missing schema', () => {
    expect(summarizeSchemaFields(null)).toEqual({
      connected: 0,
      disconnected: 0,
      mismatched: 0,
      total: 0,
    });
  });

  it('counts fields by status', () => {
    const summary = summarizeSchemaFields(
      schemaWith([
        { name: 'a', status: DataMartSchemaFieldStatus.CONNECTED },
        { name: 'b', status: DataMartSchemaFieldStatus.DISCONNECTED },
        { name: 'c', status: DataMartSchemaFieldStatus.CONNECTED_WITH_DEFINITION_MISMATCH },
      ])
    );

    expect(summary).toEqual({ connected: 1, disconnected: 1, mismatched: 1, total: 3 });
  });

  it('counts nested fields too', () => {
    const summary = summarizeSchemaFields(
      schemaWith([
        {
          name: 'record',
          status: DataMartSchemaFieldStatus.CONNECTED_WITH_DEFINITION_MISMATCH,
          fields: [
            { name: 'inner_a', status: DataMartSchemaFieldStatus.CONNECTED },
            { name: 'inner_b', status: DataMartSchemaFieldStatus.DISCONNECTED },
          ],
        },
      ])
    );

    expect(summary).toEqual({ connected: 1, disconnected: 1, mismatched: 1, total: 3 });
  });

  it('treats a field with no status as connected', () => {
    // A freshly read schema has not been through a merge, so its fields carry no status yet.
    expect(summarizeSchemaFields(schemaWith([{ name: 'a' }, { name: 'b' }]))).toEqual({
      connected: 2,
      disconnected: 0,
      mismatched: 0,
      total: 2,
    });
  });
});

describe('describeSchemaFieldSummary', () => {
  it('stays short when every field is connected', () => {
    expect(
      describeSchemaFieldSummary({ connected: 12, disconnected: 0, mismatched: 0, total: 12 })
    ).toBe('Output schema actualized: 12 fields connected');
  });

  it('spells out disconnected fields', () => {
    expect(
      describeSchemaFieldSummary({ connected: 10, disconnected: 2, mismatched: 0, total: 12 })
    ).toBe('Output schema actualized: 12 fields, 2 disconnected');
  });

  it('spells out both kinds of problem', () => {
    expect(
      describeSchemaFieldSummary({ connected: 9, disconnected: 2, mismatched: 1, total: 12 })
    ).toBe('Output schema actualized: 12 fields, 2 disconnected, 1 with a type mismatch');
  });

  it('falls back to the plain message for an empty schema', () => {
    expect(
      describeSchemaFieldSummary({ connected: 0, disconnected: 0, mismatched: 0, total: 0 })
    ).toBe('Output schema actualized');
  });

  it('uses the singular for a single field', () => {
    expect(
      describeSchemaFieldSummary({ connected: 1, disconnected: 0, mismatched: 0, total: 1 })
    ).toBe('Output schema actualized: 1 field connected');
  });
});
