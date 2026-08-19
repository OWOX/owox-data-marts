import { useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';

/**
 * Hook for managing a specific URL query parameter.
 * `setParam` and `removeParam` keep a stable identity across renders
 * (react-router recreates `setSearchParams` on every search change),
 * so they are safe to use in dependency arrays and memoized callbacks.
 * @param name - The name of the query parameter.
 * @returns An object containing the current value, a setter, and a remover.
 */
export function useUrlParam(name: string) {
  const [searchParams, setSearchParams] = useSearchParams();

  const setSearchParamsRef = useRef(setSearchParams);
  useEffect(() => {
    setSearchParamsRef.current = setSearchParams;
  });

  const value = searchParams.get(name);

  const setParam = useCallback(
    (newValue: string) => {
      setSearchParamsRef.current(
        prev => {
          const next = new URLSearchParams(prev);
          next.set(name, newValue);
          return next;
        },
        { replace: true }
      );
    },
    [name]
  );

  const removeParam = useCallback(() => {
    setSearchParamsRef.current(
      prev => {
        const next = new URLSearchParams(prev);
        next.delete(name);
        return next;
      },
      { replace: true }
    );
  }, [name]);

  return { value, setParam, removeParam };
}
