import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dataMartRelationshipService } from '../services/data-mart-relationship.service';

/**
 * Shared query key for the blendable schema request.
 * Exported so that any component fetching blendable schema uses the same
 * React Query cache entry for a given data mart.
 */
export const BLENDABLE_SCHEMA_QUERY_KEY = 'blendable-schema';

/**
 * Fetches the blendable schema for a data mart and returns a memoized Set
 * of valid blended field names — names of blended fields that belong to
 * currently included sources and are not hidden.
 *
 * Mirrors the filtering logic in ReportColumnPicker to keep the action-cell
 * "View SQL" visibility in sync with what the edit form considers "blended".
 */
export function useBlendedFieldNames(dataMartId: string | undefined): Set<string> {
  const { data: schema } = useQuery({
    queryKey: [BLENDABLE_SCHEMA_QUERY_KEY, dataMartId],
    queryFn: () => {
      if (!dataMartId) {
        return Promise.reject(new Error('dataMartId is required'));
      }
      return dataMartRelationshipService.getBlendableSchema(dataMartId);
    },
    enabled: !!dataMartId,
  });

  return useMemo(() => {
    if (!schema) return new Set<string>();
    const includedPaths = new Set(
      schema.availableSources.filter(s => s.isIncluded).map(s => s.aliasPath)
    );
    return new Set(
      schema.blendedFields
        .filter(f => includedPaths.has(f.aliasPath) && !f.isHidden)
        .map(f => f.name)
    );
  }, [schema]);
}
