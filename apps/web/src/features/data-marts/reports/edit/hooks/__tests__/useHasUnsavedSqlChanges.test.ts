import { act, renderHook } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import type { OutputConfig } from '../../../../shared/types/output-config';
import {
  applyColumnConfigChange,
  applyOutputConfigChange,
} from '../../utils/apply-output-config-change';
import { useHasUnsavedSqlChanges } from '../useHasUnsavedSqlChanges';

interface TestReportForm {
  title: string;
  columnConfig: string[] | null;
  filterConfig: OutputConfig['filterConfig'] | null;
  sortConfig: OutputConfig['sortConfig'] | null;
  limitConfig: number | null;
  aggregationConfig: OutputConfig['aggregationConfig'] | null;
  dateTruncConfig: OutputConfig['dateTruncConfig'] | null;
  uniqueCountConfig: string[];
  autoAggregationOptOut: string[];
}

const savedForm: TestReportForm = {
  title: 'Weekly revenue',
  columnConfig: ['channel', 'revenue'],
  filterConfig: null,
  sortConfig: [{ column: 'revenue', direction: 'desc' }] as OutputConfig['sortConfig'],
  limitConfig: null,
  aggregationConfig: null,
  dateTruncConfig: null,
  uniqueCountConfig: [],
  autoAggregationOptOut: [],
};

/** What the picker hands back on any edit: every key, the untouched lists widened to `[]`. */
const pickerConfig = (overrides: Partial<OutputConfig> = {}): OutputConfig => ({
  filterConfig: [],
  sortConfig: savedForm.sortConfig ?? [],
  limitConfig: null,
  aggregationConfig: [],
  dateTruncConfig: [],
  uniqueCountConfig: [],
  autoAggregationOptOut: [],
  ...overrides,
});

const renderForm = () =>
  renderHook(() => {
    const form = useForm<TestReportForm>({ defaultValues: savedForm });
    const isSqlDirty = useHasUnsavedSqlChanges(form);
    // Read inside the hook body: formState is a proxy that only subscribes to what a render reads.
    return { form, isSqlDirty, isDirty: form.formState.isDirty };
  });

describe('useHasUnsavedSqlChanges', () => {
  it('is false for the saved report', () => {
    const { result } = renderForm();

    expect(result.current.isSqlDirty).toBe(false);
  });

  it('ignores an edit that does not shape the SQL', () => {
    const { result } = renderForm();

    act(() => {
      result.current.form.setValue('title', 'Weekly revenue by channel', { shouldDirty: true });
    });

    expect(result.current.isDirty).toBe(true);
    expect(result.current.isSqlDirty).toBe(false);
  });

  it('reports a column change, and clears when it is undone', () => {
    const { result } = renderForm();

    act(() => {
      applyColumnConfigChange(result.current.form, ['channel']);
    });
    expect(result.current.isSqlDirty).toBe(true);

    act(() => {
      applyColumnConfigChange(result.current.form, ['channel', 'revenue']);
    });
    expect(result.current.isSqlDirty).toBe(false);
  });

  it('reports an output setting change', () => {
    const { result } = renderForm();

    act(() => {
      applyOutputConfigChange(result.current.form, pickerConfig({ limitConfig: 100 }));
    });

    expect(result.current.isSqlDirty).toBe(true);
  });

  // The picker writes `[]` over every list the user never opened; the query is unchanged.
  it('treats an empty list written over a null one as unchanged', () => {
    const { result } = renderForm();

    act(() => {
      applyOutputConfigChange(result.current.form, pickerConfig());
    });

    expect(result.current.form.getValues('filterConfig')).toEqual([]);
    expect(result.current.isSqlDirty).toBe(false);
  });

  it('does not count a picker repair as an unsaved edit', () => {
    const { result } = renderForm();

    act(() => {
      applyOutputConfigChange(
        result.current.form,
        pickerConfig({ uniqueCountConfig: ['orders'] }),
        {
          isRepair: true,
          changed: ['uniqueCountConfig'],
        }
      );
    });

    expect(result.current.form.getValues('uniqueCountConfig')).toEqual(['orders']);
    expect(result.current.isSqlDirty).toBe(false);
  });
});
