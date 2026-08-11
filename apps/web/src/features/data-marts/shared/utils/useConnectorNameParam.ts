import { useMemo } from 'react';
import { useSearchParams } from 'react-router';

export function useConnectorNameParam(): string | null {
  const [searchParams] = useSearchParams();
  const raw = searchParams.get('connectorName');

  return useMemo(() => {
    const trimmed = raw?.trim();
    if (!trimmed) return null;
    return trimmed;
  }, [raw]);
}
