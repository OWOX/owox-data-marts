import { createElement } from 'react';
import { Icon, type LucideProps } from 'lucide-react';
import { DEFAULT_DATA_MART_ICON, getDataMartIcon } from './data-mart-icons';
import { isLucideIconValue } from './lucide-icon-name';
import { useLucideIconCatalog } from './use-lucide-icon-catalog';

interface DataMartIconGlyphProps extends LucideProps {
  icon: string | null | undefined;
}

/**
 * Draws a Data Mart's picked icon, or the default one when none is picked or
 * the icon library does not know the picked one or cannot load. A `lucide:`
 * icon loads with the icon library; until then an empty icon of the same size
 * holds its place.
 */
export function DataMartIconGlyph({ icon, ...props }: DataMartIconGlyphProps) {
  const isLibraryIcon = isLucideIconValue(icon);
  const { catalog, failed } = useLucideIconCatalog(isLibraryIcon);

  if (!isLibraryIcon) return createElement(getDataMartIcon(icon), props);
  if (failed) return createElement(DEFAULT_DATA_MART_ICON, props);
  if (!catalog) return createElement(Icon, { ...props, iconNode: [] });
  return createElement(catalog.getLucideIcon(icon) ?? DEFAULT_DATA_MART_ICON, props);
}
