/* ---------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------ */

export interface SelectOption {
  value: string;
  label: string;
}

export type ValueAccessor<T> = (row: T) => unknown;

export type LabelMapper = (value: string) => string;

/* ---------------------------------------------------------------------------
 * Core helpers
 * ------------------------------------------------------------------------ */

/**
 * Collect unique scalar values from data using an accessor.
 *
 * - Skips null / undefined
 * - Converts values to string
 */
export function collectUniqueValues<T>(data: T[], accessor: ValueAccessor<T>): Set<string> {
  const result = new Set<string>();

  for (const row of data) {
    const raw = accessor(row);
    if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') {
      continue;
    }

    result.add(String(raw));
  }

  return result;
}

/**
 * Map values to SelectOption[].
 *
 * - Keeps value as-is
 * - Label can be customized via mapper
 * - Default label = value
 */
export function mapValuesToOptions(
  values: Iterable<string>,
  labelMapper?: LabelMapper
): SelectOption[] {
  const options: SelectOption[] = [];

  for (const value of values) {
    options.push({
      value,
      label: labelMapper ? labelMapper(value) : value,
    });
  }

  return options;
}

/**
 * Collect unique values from data and convert them to SelectOption[].
 *
 * This is the main helper intended for feature-level usage.
 */
export function collectOptionsFromData<T>(
  data: T[],
  accessor: ValueAccessor<T>,
  options?: {
    labelMapper?: LabelMapper;
    filterEmpty?: boolean;
    sort?: boolean;
  }
): SelectOption[] {
  const { labelMapper, filterEmpty = true, sort = true } = options ?? {};

  let values = Array.from(collectUniqueValues(data, accessor));

  if (filterEmpty) {
    values = values.filter(v => v.trim() !== '');
  }

  if (sort) {
    values.sort((a, b) => a.localeCompare(b));
  }

  return mapValuesToOptions(values, labelMapper);
}
