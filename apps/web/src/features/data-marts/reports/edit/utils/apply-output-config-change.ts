import type { DefaultValues, FieldValues, Path, PathValue, UseFormReturn } from 'react-hook-form';
import {
  OUTPUT_CONFIG_KEYS,
  type ColumnConfigRepairOptions,
  type OutputConfig,
  type OutputConfigRepairOptions,
} from '../../../shared/types/output-config';

/**
 * Writes a `ReportColumnPicker` config change into a report edit form. Shared by all three edit
 * forms (Google Sheets, Looker Studio, Email), which differ in nothing here.
 *
 * A user edit writes every key and dirties the form. A REPAIR — a change the picker made on its own
 * initiative, before anyone touched the form — differs twice:
 *
 * - It touches ONLY the keys it repaired. The forms keep the five rule lists as `null` until the
 *   user opens the control and hand the picker `?? []`, so writing the whole config back would put
 *   `[]` where `null` was, and the next genuine save would migrate controls nobody opened.
 * - It moves the BASELINE with the value. `setValue` with `shouldDirty: false` leaves
 *   `_defaultValues` behind, so the first dirtying edit afterwards measures the form against a
 *   baseline it can never return to: `isDirty` latches on and the unsaved-changes guard fires on a
 *   form identical to what was saved. A repair IS the saved state as far as this editor is
 *   concerned — the backend drops the metric either way — so the repaired keys become their own
 *   defaults. `keepDirtyValues` is what keeps a repair that lands mid-edit from swallowing it: an
 *   edit already made keeps both its value and its original default, and stays dirty.
 */
export function applyOutputConfigChange<T extends FieldValues>(
  form: UseFormReturn<T>,
  config: OutputConfig,
  options?: OutputConfigRepairOptions
): void {
  if (!options?.isRepair) {
    for (const key of OUTPUT_CONFIG_KEYS) {
      form.setValue(key as Path<T>, config[key] as PathValue<T, Path<T>>, { shouldDirty: true });
    }
    return;
  }
  applyRepairedValues(form, Object.fromEntries(options.changed.map(key => [key, config[key]])));
}

/**
 * The same, for the picker's COLUMN list. A user edit dirties and validates; a repair — the picker
 * materialising the implicit "all native columns" projection, because a stored joined Unique Count
 * cannot be saved without an explicit one — moves the baseline with the value like any other, so
 * merely opening such a report does not raise the unsaved-changes guard.
 */
export function applyColumnConfigChange<T extends FieldValues>(
  form: UseFormReturn<T>,
  value: string[] | null,
  options?: ColumnConfigRepairOptions
): void {
  if (!options?.isRepair) {
    form.setValue('columnConfig' as Path<T>, value as PathValue<T, Path<T>>, {
      shouldDirty: true,
      shouldValidate: true,
    });
    return;
  }
  applyRepairedValues(form, { columnConfig: value });
}

function applyRepairedValues<T extends FieldValues>(
  form: UseFormReturn<T>,
  repaired: Record<string, unknown>
): void {
  // `control._defaultValues` and NOT `formState.defaultValues`: the latter is a React-state
  // snapshot refreshed on the next render, while `reset` moves the live one synchronously. The
  // picker repairs the column list and the output config in the same effect pass, so a second
  // repair reading the snapshot would rebuild the form from pre-repair defaults and undo the first.
  const currentDefaults = form.control._defaultValues;
  form.reset({ ...currentDefaults, ...repaired } as DefaultValues<T>, REPAIR_RESET_OPTIONS);
  // `keepDirtyValues` would otherwise hand a key the user had already edited back its pre-repair
  // value, undoing the repair on the one field it exists for.
  for (const [key, value] of Object.entries(repaired)) {
    form.setValue(key as Path<T>, value as PathValue<T, Path<T>>, { shouldDirty: false });
  }
}

/** Everything a repair must not disturb: it is not a submit, a validation run, or a user edit. */
const REPAIR_RESET_OPTIONS = {
  keepDirtyValues: true,
  keepErrors: true,
  keepTouched: true,
  keepIsSubmitted: true,
  keepSubmitCount: true,
} as const;
