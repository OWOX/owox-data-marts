import { createElement } from 'react';
import { Icon, type LucideIcon, type LucideProps } from 'lucide-react';
import { DEFAULT_DATA_MART_ICON, getDataMartIcon } from './data-mart-icons';
import { isLucideIconValue } from './lucide-icon-name';
import { useLucideIconCatalog } from './use-lucide-icon-catalog';

interface DataMartIconGlyphProps extends LucideProps {
  icon: string | null | undefined;
  /** Drawn when no icon is picked or the picked one is unknown; the Data Mart default unless given. */
  fallback?: LucideIcon;
}

/**
 * Draws a Data Mart's (or a Context's) picked icon, or the default one when none
 * is picked or the icon library does not know the picked one or cannot load. A
 * `lucide:` icon loads with the icon library; until then an empty icon of the
 * same size holds its place.
 */
export function DataMartIconGlyph({
  icon,
  fallback = DEFAULT_DATA_MART_ICON,
  ...props
}: DataMartIconGlyphProps) {
  const isLibraryIcon = isLucideIconValue(icon);
  const { catalog, failed } = useLucideIconCatalog(isLibraryIcon);

  if (!isLibraryIcon) return createElement(getDataMartIcon(icon, fallback), props);
  if (failed) return createElement(fallback, props);
  if (!catalog) return createElement(Icon, { ...props, iconNode: [] });
  return createElement(catalog.getLucideIcon(icon) ?? fallback, props);
}
