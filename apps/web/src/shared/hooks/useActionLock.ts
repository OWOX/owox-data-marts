import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useActionLock
 *
 * Protects an async action from being invoked repeatedly.
 *
 * Generic:
 *  - TArgs: tuple of argument types for the action (inferred)
 *  - R: return type of the action (inferred)
 *
 * @param action - async function to protect, e.g. (arg: DataStorageType) => Promise<void>
 * @param delay - cooldown delay after action completes (ms). Default 500.
 */
export function useActionLock<TArgs extends unknown[], R = unknown>(
  action: (...args: TArgs) => Promise<R>,
  delay = 500
) {
  const [isLocked, setIsLocked] = useState(false);
  const isLockedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trigger = useCallback(
    async (...args: TArgs): Promise<R> => {
      if (isLockedRef.current) {
        return Promise.reject(new Error('Action is locked'));
      }
      isLockedRef.current = true;
      setIsLocked(true);
      try {
        const result = await action(...args);
        return result;
      } finally {
        timeoutRef.current = setTimeout(() => {
          isLockedRef.current = false;
          setIsLocked(false);
        }, delay);
      }
    },
    [action, delay]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      isLockedRef.current = false;
    };
  }, []);

  return { trigger, isLocked };
}
