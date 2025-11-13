import { useEffect, useRef, useState } from 'react';

export interface UseMarkdownPreviewProps {
  markdown: string;
  enabled?: boolean;
  debounceMs?: number;
  toHtml: (markdown: string, signal?: AbortSignal) => Promise<string>;
}

export function useMarkdownPreviewInternal({
  markdown,
  enabled = true,
  debounceMs = 300,
  toHtml,
}: UseMarkdownPreviewProps) {
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const md = markdown;
    if (!md.trim()) {
      setHtml('');
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    const t = setTimeout(() => {
      toHtml(md, controller.signal)
        .then(res => {
          setHtml(res);
        })
        .catch((e: unknown) => {
          if (controller.signal.aborted) return;
          const msg = e instanceof Error ? e.message : 'Failed to load preview';
          setError(msg);
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        });
    }, debounceMs);

    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [markdown, enabled, debounceMs, toHtml]);

  return { html, loading, error } as const;
}
