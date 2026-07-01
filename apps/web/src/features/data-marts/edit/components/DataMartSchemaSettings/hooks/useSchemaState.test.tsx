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
});
