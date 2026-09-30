import type { LucideIcon } from 'lucide-react';
import type { DataMartIconValue } from '../../enums/data-mart-icon.enum';
import { DATA_MART_ICON_OPTIONS } from './data-mart-icons';
import type { LucideIconOption } from './lucide-icon-catalog';
import { toLucideIconName } from './lucide-icon-name';

/** One tile in the icon picker. */
export interface IconPickerOption {
  value: DataMartIconValue;
  label: string;
  icon: LucideIcon;
  /** Lower-case words the search matches against. */
  searchText: string;
}

/**
 * Recommended icons as picker options. Their search text also carries the
 * glyph's own lucide name, so searching "cart" finds "Purchases".
 */
export const RECOMMENDED_ICON_OPTIONS: readonly IconPickerOption[] = DATA_MART_ICON_OPTIONS.map(
  ({ key, label, icon }) => ({
    value: key,
    label,
    icon,
    searchText: [label, key, toLucideIconName(icon.displayName ?? '')]
      .join(' ')
      .replace(/-/g, ' ')
      .toLowerCase(),
  })
);

const RECOMMENDED_GLYPHS = new Set<LucideIcon>(DATA_MART_ICON_OPTIONS.map(option => option.icon));

/** Library icons the recommended section does not already show. */
export function withoutRecommendedGlyphs(
  options: readonly LucideIconOption[]
): readonly LucideIconOption[] {
  return options.filter(option => !RECOMMENDED_GLYPHS.has(option.icon));
}

/**
 * Icons whose search text contains every word of the query. Recommended icons
 * come first; among library icons, names that start with the query lead.
 */
export function searchIconOptions(
  query: string,
  recommended: readonly IconPickerOption[],
  library: readonly IconPickerOption[]
): IconPickerOption[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const matches = (option: IconPickerOption) =>
    words.every(word => option.searchText.includes(word));

  const phrase = words.join(' ');
  const libraryMatches = library.filter(matches);
  const leading = libraryMatches.filter(option => option.searchText.startsWith(phrase));
  const rest = libraryMatches.filter(option => !option.searchText.startsWith(phrase));

  return [...recommended.filter(matches), ...leading, ...rest];
}
