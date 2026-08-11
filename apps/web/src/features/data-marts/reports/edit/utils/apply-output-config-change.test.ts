import { act, renderHook } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import type { OutputConfig } from '../../../shared/types/output-config';
import { applyColumnConfigChange, applyOutputConfigChange } from './apply-output-config-change';

/**
 * The three report edit forms all keep the five rule lists as `null` until the user opens the
 * control, and hand the picker `?? []`. Writing that `[]` back for a key the picker never touched
 * moves `_formValues` away from `_defaultValues` — which react-hook-form does NOT update under
 * `shouldDirty: false` — so the form is measured against a baseline it can never return to.
 */
interface TestReportForm {
  title: string;
  columnConfig: string[] | null;
  filterConfig: OutputConfig['filterConfig'] | null;
  sortConfig: OutputConfig['sortConfig'] | null;
  limitConfig: number | null;
  aggregationConfig: OutputConfig['aggregationConfig'] | null;
  dateTruncConfig: OutputConfig['dateTruncConfig'] | null;
  uniqueCountConfig: string[];
}

const SAVED_TITLE = 'Weekly revenue';

const savedForm: TestReportForm = {
  title: SAVED_TITLE,
  columnConfig: null,
  filterConfig: null,
  sortConfig: null,
  limitConfig: null,
  aggregationConfig: null,
  dateTruncConfig: null,
  uniqueCountConfig: ['orders'],
};

/** What the picker hands back: the six keys, the untouched ones already widened to `[]`. */
const repairedConfig: OutputConfig = {
  filterConfig: [],
  sortConfig: [],
  limitConfig: null,
  aggregationConfig: [],
  dateTruncConfig: [],
  uniqueCountConfig: [],
};

const renderForm = () =>
  renderHook(() => {
    const form = useForm<TestReportForm>({ defaultValues: savedForm });
    // Read inside the hook body: react-hook-form's formState is a proxy that only subscribes to
    // what a render actually reads.
    return { form, isDirty: form.formState.isDirty };
  });

describe('applyOutputConfigChange', () => {
  it('leaves a key the repair did not change at its saved value', () => {
    const { result } = renderForm();

    act(() => {
      applyOutputConfigChange(result.current.form, repairedConfig, {
        isRepair: true,
        changed: ['uniqueCountConfig'],
      });
    });

    expect(result.current.form.getValues('uniqueCountConfig')).toEqual([]);
    expect(result.current.form.getValues('filterConfig')).toBeNull();
    expect(result.current.form.getValues('aggregationConfig')).toBeNull();
    expect(result.current.form.getValues('sortConfig')).toBeNull();
    expect(result.current.form.getValues('dateTruncConfig')).toBeNull();
    expect(result.current.isDirty).toBe(false);
  });

  // The reported reproduction: open a repaired report, type one character in Title and delete it,
  // close. The guard fired on a form identical to what was saved.
  it('returns to not-dirty after a character is typed and deleted', () => {
    const { result } = renderForm();

    act(() => {
      applyOutputConfigChange(result.current.form, repairedConfig, {
        isRepair: true,
        changed: ['uniqueCountConfig', 'sortConfig'],
      });
    });
    act(() => {
      result.current.form.setValue('title', `${SAVED_TITLE}x`, { shouldDirty: true });
    });
    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.form.setValue('title', SAVED_TITLE, { shouldDirty: true });
    });

    expect(result.current.isDirty).toBe(false);
  });

  // A repair can land after the user has started editing — a schema refetch, not only the open.
  it('keeps an edit already in progress, and its dirtiness', () => {
    const { result } = renderForm();

    act(() => {
      result.current.form.setValue('title', 'Weekly revenue by channel', { shouldDirty: true });
    });
    act(() => {
      applyOutputConfigChange(result.current.form, repairedConfig, {
        isRepair: true,
        changed: ['uniqueCountConfig'],
      });
    });

    expect(result.current.form.getValues('title')).toBe('Weekly revenue by channel');
    expect(result.current.form.getValues('uniqueCountConfig')).toEqual([]);
    expect(result.current.isDirty).toBe(true);
  });

  it('writes every key and dirties the form for a real user edit', () => {
    const { result } = renderForm();

    act(() => {
      applyOutputConfigChange(result.current.form, {
        ...repairedConfig,
        limitConfig: 100,
        uniqueCountConfig: ['orders'],
      });
    });

    expect(result.current.form.getValues('filterConfig')).toEqual([]);
    expect(result.current.form.getValues('limitConfig')).toBe(100);
    expect(result.current.isDirty).toBe(true);
  });
});

describe('applyColumnConfigChange', () => {
  // The picker materializes the implicit "all native columns" projection for a STORED joined
  // Unique Count, which cannot be saved without one. That is not an edit: dirtying for it guards a
  // form nobody touched, and leaving `_defaultValues` behind latches `isDirty` on for good.
  it('applies a repair without dirtying, and moves the baseline with it', () => {
    const { result } = renderForm();

    act(() => {
      applyColumnConfigChange(result.current.form, ['id', 'amount'], { isRepair: true });
    });

    expect(result.current.form.getValues('columnConfig')).toEqual(['id', 'amount']);
    expect(result.current.isDirty).toBe(false);

    act(() => {
      result.current.form.setValue('title', 'Renamed', { shouldDirty: true });
      result.current.form.setValue('title', SAVED_TITLE, { shouldDirty: true });
    });

    expect(result.current.isDirty).toBe(false);
  });

  it('dirties the form for a real column selection', () => {
    const { result } = renderForm();

    act(() => {
      applyColumnConfigChange(result.current.form, ['id']);
    });

    expect(result.current.form.getValues('columnConfig')).toEqual(['id']);
    expect(result.current.isDirty).toBe(true);
  });
});

// The picker materializes the column projection and prunes the config in the SAME effect pass, so
// both repairs run before React re-renders. One `act` per repair would flush the state between them
// and hide it — this is the production ordering.
describe('two repairs in one pass', () => {
  it('keeps both, in either order', () => {
    const { result } = renderForm();

    act(() => {
      applyColumnConfigChange(result.current.form, ['id', 'amount'], { isRepair: true });
      applyOutputConfigChange(result.current.form, repairedConfig, {
        isRepair: true,
        changed: ['uniqueCountConfig'],
      });
    });

    expect(result.current.form.getValues('columnConfig')).toEqual(['id', 'amount']);
    expect(result.current.form.getValues('uniqueCountConfig')).toEqual([]);
    expect(result.current.form.getValues('filterConfig')).toBeNull();
    expect(result.current.isDirty).toBe(false);
  });

  it('leaves neither behind when the output repair runs first', () => {
    const { result } = renderForm();

    act(() => {
      applyOutputConfigChange(result.current.form, repairedConfig, {
        isRepair: true,
        changed: ['uniqueCountConfig', 'sortConfig'],
      });
      applyColumnConfigChange(result.current.form, ['id'], { isRepair: true });
    });

    expect(result.current.form.getValues('columnConfig')).toEqual(['id']);
    expect(result.current.form.getValues('uniqueCountConfig')).toEqual([]);
    expect(result.current.form.getValues('sortConfig')).toEqual([]);
    expect(result.current.isDirty).toBe(false);
  });
});
