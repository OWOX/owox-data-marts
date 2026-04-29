import type { FilterConfigItem, FilterOperator } from './types';

export type AvailabilityValue = 'none' | 'first' | 'maintenance' | 'both';

export const AVAILABILITY_VALUE = {
  NONE: 'none',
  FIRST: 'first',
  MAINTENANCE: 'maintenance',
  BOTH: 'both',
} as const;

const DEFAULT_OPERATORS: FilterOperator[] = ['eq', 'neq'];

// Returns ALL categories the row qualifies for, so picking a single option
// like "Reporting" matches every row with reporting on — including rows that
// also have maintenance on. Picking "Reporting + Maintenance" only matches
// rows where both are on. Filter logic OR-matches array values via `some`.
export function classifyAvailability(
  firstFlag: boolean | undefined,
  maintenanceFlag: boolean | undefined
): AvailabilityValue[] {
  const first = firstFlag === true;
  const maintenance = maintenanceFlag === true;
  if (!first && !maintenance) return [AVAILABILITY_VALUE.NONE];
  const tags: AvailabilityValue[] = [];
  if (first) tags.push(AVAILABILITY_VALUE.FIRST);
  if (maintenance) tags.push(AVAILABILITY_VALUE.MAINTENANCE);
  if (first && maintenance) tags.push(AVAILABILITY_VALUE.BOTH);
  return tags;
}

interface BuildAvailabilityFilterArgs<K extends string> {
  id: K;
  firstLabel: string;
  label?: string;
}

export function buildAvailabilityFilter<K extends string>(
  args: BuildAvailabilityFilterArgs<K>
): FilterConfigItem<K> {
  const { id, firstLabel, label = 'Availability' } = args;
  return {
    id,
    label,
    dataType: 'enum',
    operators: DEFAULT_OPERATORS,
    options: [
      { value: AVAILABILITY_VALUE.BOTH, label: `${firstLabel} + Maintenance` },
      { value: AVAILABILITY_VALUE.FIRST, label: firstLabel },
      { value: AVAILABILITY_VALUE.MAINTENANCE, label: 'Maintenance' },
      { value: AVAILABILITY_VALUE.NONE, label: 'None' },
    ],
  };
}
