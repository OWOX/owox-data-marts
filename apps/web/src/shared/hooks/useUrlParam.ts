import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Hook for managing a specific URL query parameter.
 * @param name - The name of the query parameter.
 * @returns An object containing the current value, a setter, and a remover.
 */
export function useUrlParam(name: string) {
  const [searchParams, setSearchParams] = useSearchParams();

  const value = searchParams.get(name);

  const setParam = useCallback(
    (newValue: string) => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          next.set(name, newValue);
          return next;
        },
        { replace: true }
      );
    },
    [name, setSearchParams]
  );

  const removeParam = useCallback(() => {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.delete(name);
        return next;
      },
      { replace: true }
    );
  }, [name, setSearchParams]);

  return { value, setParam, removeParam };
}
