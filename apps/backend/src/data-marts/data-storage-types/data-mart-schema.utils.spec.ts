import {
  isConnected,
  createBaseFieldSchemaForType,
  getPrimaryKeyFields,
} from './data-mart-schema.utils';
import { DataMartSchemaFieldStatus } from './enums/data-mart-schema-field-status.enum';
import type { DataMartSchemaField } from './data-mart-schema.type';
import { z } from 'zod';

describe('isConnected', () => {
  const field = (status: DataMartSchemaFieldStatus): DataMartSchemaField =>
    ({ name: 'f', type: 'STRING', status }) as unknown as DataMartSchemaField;

  it('treats CONNECTED as present in the source', () => {
    expect(isConnected(field(DataMartSchemaFieldStatus.CONNECTED))).toBe(true);
  });

  it('treats CONNECTED_WITH_DEFINITION_MISMATCH as present in the source', () => {
    expect(isConnected(field(DataMartSchemaFieldStatus.CONNECTED_WITH_DEFINITION_MISMATCH))).toBe(
      true
    );
  });

  it('treats DISCONNECTED as gone from the source', () => {
    expect(isConnected(field(DataMartSchemaFieldStatus.DISCONNECTED))).toBe(false);
  });
});

describe('createBaseFieldSchemaForType — aggregation governance fields', () => {
  const schema = createBaseFieldSchemaForType(z.string());
  const base = {
    name: 'amount',
    type: 'INTEGER',
    status: DataMartSchemaFieldStatus.CONNECTED,
  };

  it('accepts a field without aggregationRole / allowedAggregations (optional)', () => {
    const result = schema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it('accepts a field with aggregationRole and allowedAggregations', () => {
    const result = schema.safeParse({
      ...base,
      aggregationRole: 'metric',
      allowedAggregations: ['SUM', 'AVG', 'P50'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.aggregationRole).toBe('metric');
      expect(result.data.allowedAggregations).toEqual(['SUM', 'AVG', 'P50']);
    }
  });

  it('accepts an explicit empty allowedAggregations array (override = no functions)', () => {
    const result = schema.safeParse({ ...base, allowedAggregations: [] });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid aggregationRole', () => {
    const result = schema.safeParse({ ...base, aggregationRole: 'measure' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown aggregation function', () => {
    const result = schema.safeParse({ ...base, allowedAggregations: ['NOPE'] });
    expect(result.success).toBe(false);
  });
});

describe('getPrimaryKeyFields', () => {
  const connected = DataMartSchemaFieldStatus.CONNECTED;

  const mkField = (
    name: string,
    isPrimaryKey: boolean,
    extra: Partial<DataMartSchemaField> = {}
  ): DataMartSchemaField =>
    ({
      name,
      type: 'STRING',
      status: connected,
      isPrimaryKey,
      ...extra,
    }) as unknown as DataMartSchemaField;

  it('returns empty array when no fields are primary keys', () => {
    const fields: DataMartSchemaField[] = [mkField('id', false), mkField('name', false)];
    expect(getPrimaryKeyFields(fields)).toEqual([]);
  });

  it('returns a single primary-key field', () => {
    const fields: DataMartSchemaField[] = [mkField('id', true), mkField('name', false)];
    const result = getPrimaryKeyFields(fields);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('id');
  });

  it('returns all fields that are primary keys (composite PK)', () => {
    const fields: DataMartSchemaField[] = [
      mkField('user_id', true),
      mkField('event_id', true),
      mkField('timestamp', false),
    ];
    const result = getPrimaryKeyFields(fields);
    expect(result).toHaveLength(2);
    expect(result.map(f => f.name)).toEqual(['user_id', 'event_id']);
  });

  it('finds a nested primary key and keeps its full dotted path (not just the leaf)', () => {
    const nested = mkField('inner_pk', true);
    const container = {
      ...mkField('category', false),
      fields: [nested],
    } as unknown as DataMartSchemaField;
    const fields: DataMartSchemaField[] = [mkField('top_non_pk', false), container];
    const result = getPrimaryKeyFields(fields);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('category.inner_pk');
  });

  it('excludes a DISCONNECTED primary-key field (its column is gone from the source)', () => {
    const fields: DataMartSchemaField[] = [
      mkField('id', true, { status: DataMartSchemaFieldStatus.DISCONNECTED }),
      mkField('event_id', true),
    ];
    expect(getPrimaryKeyFields(fields).map(f => f.name)).toEqual(['event_id']);
  });

  it('excludes a primary-key field hidden for reporting', () => {
    const fields: DataMartSchemaField[] = [
      mkField('id', true, { isHiddenForReporting: true }),
      mkField('event_id', true),
    ];
    expect(getPrimaryKeyFields(fields).map(f => f.name)).toEqual(['event_id']);
  });

  it('returns empty array when fields list is empty', () => {
    expect(getPrimaryKeyFields([])).toEqual([]);
  });
});
