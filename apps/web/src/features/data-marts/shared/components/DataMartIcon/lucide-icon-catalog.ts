import { icons, type LucideIcon } from 'lucide-react';
import { LUCIDE_ICON_PREFIX, type LucideIconValue } from '../../enums/data-mart-icon.enum';
import { lucideIconLabel, toLucideIconName } from './lucide-icon-name';

/*
 * Every lucide icon, keyed by its `lucide:<name>` value. This module pulls the
 * whole icon library, so it is only ever loaded lazily (see
 * `use-lucide-icon-catalog.ts`) — never import it statically.
 */

export interface LucideIconOption {
  value: LucideIconValue;
  label: string;
  icon: LucideIcon;
  /** Lower-case words the picker search matches against. */
  searchText: string;
}

export const LUCIDE_ICON_OPTIONS: readonly LucideIconOption[] = Object.entries(icons)
  .map(([componentName, icon]) => {
    const name = toLucideIconName(componentName);
    return {
      value: `${LUCIDE_ICON_PREFIX}${name}` satisfies LucideIconValue,
      label: lucideIconLabel(name),
      icon,
      searchText: name.replace(/-/g, ' '),
    };
  })
  .sort((a, b) => a.value.localeCompare(b.value));

const ICONS_BY_VALUE = new Map<string, LucideIcon>(
  LUCIDE_ICON_OPTIONS.map(option => [option.value, option.icon])
);

/** The lucide icon a `lucide:<name>` value names, if the library has it. */
export function getLucideIcon(value: string): LucideIcon | undefined {
  return ICONS_BY_VALUE.get(value);
}
