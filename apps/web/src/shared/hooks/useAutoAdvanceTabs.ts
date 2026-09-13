import { useCallback, useEffect, useRef, useState } from 'react';

interface PauseHandlers {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
}

interface UseAutoAdvanceTabsReturn {
  value: string;
  onValueChange: (next: string) => void;
  pauseHandlers: PauseHandlers;
  /** False once the user has manually picked a tab, or if reduced motion is preferred — autoplay never resumes after that. */
  isAutoPlaying: boolean;
  intervalMs: number;
}

/**
 * Cycles a controlled tab `value` through `tabValues` on a timer, meant to be
 * spread onto a `Tabs`/`TabsList` pair (`value`/`onValueChange`, and
 * `pauseHandlers` on the wrapping element).
 *
 * Autoplay pauses while hovered/focused, stops for good the moment the user
 * picks a tab manually (via `onValueChange`), and never starts at all when
 * the user prefers reduced motion. `isAutoPlaying` reflects that stopped
 * state so callers can hide time-based indicators (e.g. a progress bar) once
 * it no longer applies.
 */
export function useAutoAdvanceTabs(
  tabValues: string[],
  intervalMs = 6000
): UseAutoAdvanceTabsReturn {
  const [value, setValue] = useState(tabValues[0]);
  const [isAutoPlaying, setIsAutoPlaying] = useState(
    () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const pausedRef = useRef(false);

  useEffect(() => {
    if (!isAutoPlaying) return;

    const id = setInterval(() => {
      if (pausedRef.current) return;
      setValue(current => {
        const nextIndex = (tabValues.indexOf(current) + 1) % tabValues.length;
        return tabValues[nextIndex];
      });
    }, intervalMs);

    return () => {
      clearInterval(id);
    };
  }, [tabValues, intervalMs, isAutoPlaying]);

  const onValueChange = useCallback((next: string) => {
    setIsAutoPlaying(false);
    setValue(next);
  }, []);

  const pauseHandlers: PauseHandlers = {
    onMouseEnter: () => {
      pausedRef.current = true;
    },
    onMouseLeave: () => {
      pausedRef.current = false;
    },
    onFocus: () => {
      pausedRef.current = true;
    },
    onBlur: () => {
      pausedRef.current = false;
    },
  };

  return { value, onValueChange, pauseHandlers, isAutoPlaying, intervalMs };
}
