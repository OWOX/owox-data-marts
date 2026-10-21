import type { UserProjection } from '../../../shared/types/user-projection';

export interface FilterOption {
  value: string;
  label: string;
}

/** One option per value, by label; a selection no loaded row names keeps a fallback label. */
export function filterOptions(
  pairs: Iterable<readonly [string, string]>,
  selected: string | null,
  fallback: string
): FilterOption[] {
  const labels = new Map<string, string>();
  for (const [value, label] of pairs) {
    if (!labels.has(value)) {
      labels.set(value, label);
    }
  }
  if (selected !== null && !labels.has(selected)) {
    labels.set(selected, fallback);
  }
  return [...labels]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** The owner's name, else email, else the fallback; an empty field counts as unset. */
export function ownerLabel(owner: UserProjection, fallback: string): string {
  return [owner.fullName, owner.email].find(Boolean) ?? fallback;
}
