import { createElement } from 'react';
import type { LucideProps } from 'lucide-react';
import { getDataMartIcon } from './data-mart-icons';

interface DataMartIconGlyphProps extends LucideProps {
  icon: string | null | undefined;
}

/** Draws a Data Mart's picked icon, or the default one when none is picked. */
export function DataMartIconGlyph({ icon, ...props }: DataMartIconGlyphProps) {
  return createElement(getDataMartIcon(icon), props);
}
