import { useWatch, type FieldValues, type Path, type UseFormReturn } from 'react-hook-form';
import { OUTPUT_CONFIG_KEYS } from '../../../shared/types/output-config';

/** The form fields the report's SQL is built from: the Report Columns section. */
const SQL_SHAPING_KEYS = ['columnConfig', ...OUTPUT_CONFIG_KEYS] as const;

/**
 * Whether the report form holds edits that would change the report's generated SQL.
 *
 * Narrower than the form's `isDirty` on purpose: a schedule, owner, title or message edit leaves
 * the SQL as saved, so Preview SQL must not warn about it. The rule lists are compared with `null`
 * and `[]` as equal — the forms keep a list `null` until its control is opened and the picker
 * writes `[]` back on the first edit, which changes the stored value but not the query.
 */
export function useHasUnsavedSqlChanges<T extends FieldValues>(form: UseFormReturn<T>): boolean {
  const values = useWatch({
    control: form.control,
    name: SQL_SHAPING_KEYS as unknown as readonly Path<T>[],
  }) as unknown[];
  // The live baseline, not the `formState.defaultValues` snapshot: a picker repair moves the
  // baseline with `reset` and the value with `setValue` in one pass, and the snapshot only
  // catches up a render later — long enough to report a repaired key as an unsaved edit.
  const defaults = form.control._defaultValues as Record<string, unknown> | undefined;

  return SQL_SHAPING_KEYS.some(
    (key, index) => !isSameSqlInput(key, values[index], defaults?.[key])
  );
}

function isSameSqlInput(key: string, current: unknown, saved: unknown): boolean {
  return isDeepEqual(normalize(key, current), normalize(key, saved));
}

function normalize(key: string, value: unknown): unknown {
  if (value !== null && value !== undefined) {
    return value;
  }
  // `columnConfig: null` means "every native column", which an empty list does not; the
  // limit has no list form. Every other key is a list where absent and empty mean the same.
  return key === 'columnConfig' || key === 'limitConfig' ? null : [];
}

function isDeepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => isDeepEqual(item, b[index]))
    );
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord).filter(k => aRecord[k] !== undefined);
  const bKeys = Object.keys(bRecord).filter(k => bRecord[k] !== undefined);
  return (
    aKeys.length === bKeys.length &&
    aKeys.every(k => Object.prototype.hasOwnProperty.call(bRecord, k)) &&
    aKeys.every(k => isDeepEqual(aRecord[k], bRecord[k]))
  );
}
