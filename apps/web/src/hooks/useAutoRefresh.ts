import { useEffect, useRef } from 'react';

interface UseAutoRefreshOptions {
  enabled: boolean;
  intervalMs?: number;
  onlyWhenVisible?: boolean;
  onTick: (signal: AbortSignal) => void | Promise<void>;
}

/**
 * Custom hook for auto-refreshing data at regular intervals
 *
 * @param enabled - Whether auto-refresh is enabled
 * @param intervalMs - Interval in milliseconds (default: 5000)
 * @param onlyWhenVisible - Only refresh when tab is visible (default: true)
 * @param onTick - Callback function to execute on each tick, receives AbortSignal
 *
 * @example
 * useAutoRefresh({
 *   enabled: true,
 *   onTick: (signal) => {
 *     fetchData(id, { signal });
 *   }
 * });
 */
export function useAutoRefresh({
  enabled,
  intervalMs = 5000,
  onlyWhenVisible = true,
  onTick,
}: UseAutoRefreshOptions) {
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) return;

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    const tick = () => {
      if (!onlyWhenVisible || document.visibilityState === 'visible') {
        const controller = new AbortController();
        void onTickRef.current(controller.signal);
      }
    };

    tick();
    const intervalId = window.setInterval(tick, intervalMs);

    return () => {
      window.clearInterval(intervalId);
      abortControllerRef.current?.abort();
    };
  }, [enabled, intervalMs, onlyWhenVisible]);
}
