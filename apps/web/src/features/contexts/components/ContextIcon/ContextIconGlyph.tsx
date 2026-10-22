import type { LucideProps } from 'lucide-react';
import { DataMartIconGlyph } from '../../../data-marts/shared/components/DataMartIcon';
import { DEFAULT_CONTEXT_ICON } from './context-icon';

interface ContextIconGlyphProps extends LucideProps {
  icon: string | null | undefined;
}

/** Draws a context's picked icon, or the default context icon when none is picked. */
export function ContextIconGlyph({ icon, ...props }: ContextIconGlyphProps) {
  return <DataMartIconGlyph icon={icon} fallback={DEFAULT_CONTEXT_ICON} {...props} />;
}
