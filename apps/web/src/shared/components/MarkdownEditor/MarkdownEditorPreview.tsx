import { type ReactNode, useEffect, useState } from 'react';
import { SkeletonText } from '@owox/ui/components/common/skeleton-text';
import { useTheme } from 'next-themes';

function readThemeColors(): { bg: string; fg: string } {
  if (typeof window === 'undefined') return { bg: '#fff', fg: '#000' };
  const s = getComputedStyle(document.documentElement);
  const bg = s.getPropertyValue('--background').trim() || '#fff';
  const fg = s.getPropertyValue('--foreground').trim() || '#000';
  return { bg, fg };
}

export interface MarkdownEditorPreviewProps {
  html: string;
  loading?: boolean;
  error?: string | null;
  height?: number | string;
  className?: string;
  emptyState?: ReactNode;
}

export function MarkdownEditorPreview({
  html,
  loading = false,
  error = null,
  height = 240,
  className,
  emptyState = <div className='text-muted-foreground text-sm'>Nothing to preview</div>,
}: MarkdownEditorPreviewProps) {
  const { resolvedTheme } = useTheme();
  const [colors, setColors] = useState(() => readThemeColors());

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setColors(readThemeColors());
    });
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [resolvedTheme]);

  return (
    <div
      className={`bg-background overflow-auto rounded-md pl-2 ${className ?? ''}`}
      style={{ height }}
    >
      {loading && <SkeletonText />}
      {!loading && error && <div className='text-destructive text-sm'>Error: {error}</div>}
      {!loading && !error && !html && emptyState}
      {!loading && !error && !!html && (
        <iframe
          key={`${String(resolvedTheme)}-${colors.bg}-${colors.fg}`}
          title='Markdown preview'
          sandbox='allow-popups allow-popups-to-escape-sandbox'
          srcDoc={`<!doctype html>
            <html lang='en' style="background:${colors.bg};color:${colors.fg}">
              <head>
                <meta charset='utf-8'/>
                <base target='_blank'>
              </head>
              <body>${html}</body>
            </html>`}
          className='h-full w-full border-0'
        />
      )}
    </div>
  );
}
