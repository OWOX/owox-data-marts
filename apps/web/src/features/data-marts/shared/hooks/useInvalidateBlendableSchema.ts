import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { BLENDABLE_SCHEMA_QUERY_KEY } from './blendable-schema-query-key';

/**
 * Refetches the blendable schema every reader on the page shares.
 *
 * A Data Mart's schema decides what that payload holds — its native fields, and the backend's
 * verdict on which calculated fields still resolve — so whoever persists a schema has to
 * call this. Without it the output schema's own icons and the report column picker both keep
 * showing the pre-save verdict until the page is reloaded, which reads as a metric the analyst
 * just fixed staying broken.
 */
export function useInvalidateBlendableSchema(): () => void {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [BLENDABLE_SCHEMA_QUERY_KEY] });
  }, [queryClient]);
}
