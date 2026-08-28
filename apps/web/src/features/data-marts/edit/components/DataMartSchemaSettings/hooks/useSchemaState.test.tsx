// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DataMartSchema } from '../../../../shared/types/data-mart-schema.types';
import { useSchemaState } from './useSchemaState';

const initialSchema = {
  type: 'bigquery-data-mart-schema',
  fields: [{ name: 'id', type: 'INTEGER', mode: 'NULLABLE' }],
} as DataMartSchema;

describe('useSchemaState', () => {
  it('preserves follow-up changes when the saved schema arrives as the new initial schema', () => {
    const { result, rerender } = renderHook(
      ({ initial }: { initial: DataMartSchema }) => useSchemaState(initial),
      { initialProps: { initial: initialSchema } }
    );

    const savedSchema = {
      ...initialSchema,
      fields: [{ ...initialSchema.fields[0], description: 'Manual description' }],
    } as DataMartSchema;

    act(() => {
      result.current.markSchemaSaved(savedSchema);
      result.current.updateSchema([
        { ...savedSchema.fields[0], alias: 'Generated alias' },
      ] as typeof savedSchema.fields);
    });
    rerender({ initial: savedSchema });

    expect(result.current.schema?.fields[0]).toMatchObject({
      description: 'Manual description',
      alias: 'Generated alias',
    });
    expect(result.current.isDirty).toBe(true);
  });

  it('keeps unsaved edits when a background refetch republishes the same saved schema', () => {
    const { result, rerender } = renderHook(
      ({ initial }: { initial: DataMartSchema }) => useSchemaState(initial),
      { initialProps: { initial: initialSchema } }
    );

    act(() => {
      result.current.updateSchema([
        ...initialSchema.fields,
        {
          name: 'activation_rate',
          type: 'FLOAT',
          mode: 'NULLABLE',
          calculated: { formula: 'SAFE_DIVIDE(SUM(a), SUM(b))' },
        },
      ] as typeof initialSchema.fields);
    });
    expect(result.current.schema?.fields).toHaveLength(2);

    // Nothing was saved: this is the SAME persisted schema arriving as a fresh object, which is
    // what any background refetch of the Data Mart produces.
    rerender({
      initial: { ...initialSchema, fields: [...initialSchema.fields] } as DataMartSchema,
    });

    expect(result.current.schema?.fields).toHaveLength(2);
    expect(result.current.isDirty).toBe(true);
  });

  // `markSchemaSaved` puts the CLIENT's copy on screen — the level belongs to the save, which
  // derives it. Content comparison must therefore not treat the server's answer as already
  // applied, or the derived level never lands and the row keeps a shape the save disagreed with.
  it('still accepts the server copy of a schema it was told to keep', () => {
    const clientSchema = {
      ...initialSchema,
      fields: [{ name: 'ctr', type: 'FLOAT', mode: 'NULLABLE', calculated: { formula: 'SUM(a)' } }],
    } as DataMartSchema;
    const serverSchema = {
      ...initialSchema,
      fields: [
        {
          name: 'ctr',
          type: 'FLOAT',
          mode: 'NULLABLE',
          calculated: { formula: 'SUM(a)', level: 'metric' },
        },
      ],
    } as DataMartSchema;

    const { result, rerender } = renderHook(
      ({ initial }: { initial: DataMartSchema }) => useSchemaState(initial),
      { initialProps: { initial: initialSchema } }
    );

    act(() => {
      result.current.markSchemaSaved(clientSchema);
    });
    // The publish this save produces is skipped, as the guarded follow-up action needs.
    rerender({ initial: serverSchema });
    expect(result.current.schema?.fields[0]).not.toHaveProperty('calculated.level');

    // The one after it is not: the server's copy differs from what is on screen, so it lands.
    rerender({ initial: { ...serverSchema, fields: [...serverSchema.fields] } as DataMartSchema });
    expect(result.current.schema?.fields[0]).toMatchObject({ calculated: { level: 'metric' } });
  });
});
