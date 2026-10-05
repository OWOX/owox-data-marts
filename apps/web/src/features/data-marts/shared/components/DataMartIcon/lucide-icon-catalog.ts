import * as lucide from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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

export const LUCIDE_ICON_OPTIONS: readonly LucideIconOption[] = Object.entries(lucide.icons)
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

// When lucide renames an icon, the old name lives on only as an alias export,
// not in `icons`. Resolve aliases too, so a value saved under an old name keeps
// drawing its icon after a lucide-react upgrade. The picker lists current names only.
const CURRENT_ICONS = new Set<unknown>(LUCIDE_ICON_OPTIONS.map(option => option.icon));
for (const [exportName, component] of Object.entries(lucide)) {
  if (!CURRENT_ICONS.has(component)) continue;
  if (exportName.startsWith('Lucide') || exportName.endsWith('Icon')) continue;
  const value = `${LUCIDE_ICON_PREFIX}${toLucideIconName(exportName)}`;
  if (!ICONS_BY_VALUE.has(value)) ICONS_BY_VALUE.set(value, component as LucideIcon);
}

/** The lucide icon a `lucide:<name>` value names (current name or alias), if the library has it. */
export function getLucideIcon(value: string): LucideIcon | undefined {
  return ICONS_BY_VALUE.get(value);
}
