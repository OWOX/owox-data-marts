import { type ReactNode } from 'react';

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
  // Read theme CSS variables on every render so colors update immediately on theme switch
  let bg = '#fff';
  let fg = '#000';
  if (typeof window !== 'undefined') {
    const s = getComputedStyle(document.documentElement);
    const bgVar = s.getPropertyValue('--background').trim();
    const fgVar = s.getPropertyValue('--foreground').trim();
    if (bgVar) bg = bgVar;
    if (fgVar) fg = fgVar;
  }

  return (
    <div className={`bg-background overflow-auto p-4 ${className ?? ''}`} style={{ height }}>
      {loading && <div className='text-muted-foreground text-sm'>Generating preview…</div>}
      {!loading && error && <div className='text-destructive text-sm'>Error: {error}</div>}
      {!loading && !error && !html && emptyState}
      {!loading && !error && !!html && (
        <iframe
          title='Markdown preview'
          sandbox='allow-popups allow-popups-to-escape-sandbox'
          srcDoc={`<!doctype html><html style="background:${bg};color:${fg}"><head><meta charset='utf-8'/><base target='_blank'></head><body>${html}</body></html>`}
          className='h-full w-full border-0'
        />
      )}
    </div>
  );
}
