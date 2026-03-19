import type { FiltersState } from './types';

export type FilterAccessors<K extends string, T> = Record<K, (row: T) => unknown>;

/**
 * A filter row is valid when all three fields are filled and at least one value
 * has been entered. Used in both toFiltersState (to strip empty placeholder rows)
 * and in canApply (to determine whether the Apply button should be enabled).
 */
export function isFilterRowValid(row: {
  fieldId: string;
  operator: string;
  value: string[];
}): boolean {
  return row.fieldId !== '' && row.operator !== '' && row.value.length > 0;
}

/**
 * Evaluate a single operator condition against a row value.
 * `filterValues` is always a string array; eq/neq treat it as a set,
 * contains/not_contains use only the first element.
 */
function matchOperator(rowValue: unknown, operator: string, filterValues: string[]): boolean {
  // Handle array row values (e.g. owner lists) — match if any element satisfies the condition
  if (Array.isArray(rowValue)) {
    switch (operator) {
      case 'eq':
        return rowValue.some(v => filterValues.includes(String(v)));
      case 'neq':
        return !rowValue.some(v => filterValues.includes(String(v)));
      case 'contains':
        return rowValue.some(v =>
          String(v)
            .toLowerCase()
            .includes((filterValues[0] ?? '').toLowerCase())
        );
      case 'not_contains':
        return !rowValue.some(v =>
          String(v)
            .toLowerCase()
            .includes((filterValues[0] ?? '').toLowerCase())
        );
      default:
        return true;
    }
  }

  const str = String(rowValue);
  switch (operator) {
    case 'eq':
      return filterValues.includes(str);
    case 'neq':
      return !filterValues.includes(str);
    case 'contains':
      return str.toLowerCase().includes((filterValues[0] ?? '').toLowerCase());
    case 'not_contains':
      return !str.toLowerCase().includes((filterValues[0] ?? '').toLowerCase());
    default:
      return true;
  }
}

/**
 * Apply filters to a data array using AND logic.
 *
 * Pure function with zero React or table dependencies.
 * If there are no filters, returns `data` unchanged.
 *
 * @param data - The source data array
 * @param state - Current FiltersState
 * @param accessors - Map from filter fieldId to a function that extracts the
 *   comparable value from a row
 */
export function applyFiltersToData<K extends string, T>(
  data: T[],
  state: FiltersState<K>,
  accessors: FilterAccessors<K, T>
): T[] {
  if (state.filters.length === 0) return data;

  return data.filter(row =>
    state.filters.every(filter => {
      const accessor = accessors[filter.fieldId];
      return matchOperator(accessor(row), filter.operator, filter.value);
    })
  );
}
