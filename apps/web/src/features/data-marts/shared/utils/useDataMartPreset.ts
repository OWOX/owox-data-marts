import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getDataMartPreset } from './data-mart-presets';

export function useDataMartPreset() {
  const [searchParams] = useSearchParams();
  const raw = searchParams.get('preset');

  return useMemo(() => {
    if (!raw) return undefined;
    const normalized = raw.toLowerCase();
    return getDataMartPreset(normalized);
  }, [raw]);
}
