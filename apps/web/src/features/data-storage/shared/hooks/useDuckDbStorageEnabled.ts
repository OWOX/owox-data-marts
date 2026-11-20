import { useFlags } from '../../../../app/store/hooks';
import { checkVisible } from '../../../../utils';

export function useDuckDbStorageEnabled(): boolean {
  const { flags } = useFlags();
  return checkVisible('DUCKDB_STORAGE_ENABLED', 'true', flags);
}
