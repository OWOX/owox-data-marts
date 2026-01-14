/**
 * Hook to prefetch data on hover.
 *
 * @param prefetch - The function to prefetch the data.
 * @param delay - The delay in milliseconds before prefetching the data.
 * @param enabled - Whether the prefetching is enabled.
 * @returns An object with the onMouseEnter and onMouseLeave handlers.
 */

import { useCallback, useEffect, useRef } from 'react';

interface UsePrefetchOnHoverOptions {
  prefetch: () => Promise<void>;
  delay?: number;
  enabled?: boolean;
}

export function usePrefetchOnHover({
  prefetch,
  delay = 100,
  enabled = true,
}: UsePrefetchOnHoverOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onMouseEnter = useCallback(() => {
    if (!enabled) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      void prefetch();
    }, delay);
  }, [prefetch, delay, enabled]);

  const onMouseLeave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return {
    onMouseEnter,
    onMouseLeave,
  };
}
