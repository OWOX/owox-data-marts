import { type ReactNode } from 'react';
import { SkeletonText } from '@owox/ui/components/common/skeleton-text';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

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
  const [colors, setColors] = useState({ bg: '#fff', fg: '#000' });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let frame2: number;
    const frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => {
        const s = getComputedStyle(document.documentElement);
        const bg = s.getPropertyValue('--background').trim() || '#fff';
        const fg = s.getPropertyValue('--foreground').trim() || '#000';

        setColors({ bg, fg });
      });
    });

    return () => {
      cancelAnimationFrame(frame1);
      cancelAnimationFrame(frame2);
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
