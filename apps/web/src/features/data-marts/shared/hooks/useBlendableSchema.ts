import { useQuery } from '@tanstack/react-query';
import { dataMartRelationshipService } from '../services/data-mart-relationship.service';
import type { BlendableSchema } from '../types/relationship.types';
import { BLENDABLE_SCHEMA_QUERY_KEY } from './blendable-schema-query-key';

/**
 * The one way to read a Data Mart's blendable schema.
 *
 * Several parts of the Data Mart editor need it at once. Report-safe readers share the default
 * React Query entry; options partition the key so the relationship editor's draft-inclusive
 * payload cannot leak into report or formula inputs. When both variants render on one page, this
 * intentionally means two requests. Prefix invalidation still refreshes every variant after a
 * relationship or blended-config change.
 *
 * `skipLoadingIndicator` because every caller renders its own pending state; a global overlay for
 * a request that is a detail of one card is noise.
 */
export function useBlendableSchema(
  dataMartId: string,
  { includeDraftTargets = false }: { includeDraftTargets?: boolean } = {}
) {
  return useQuery({
    queryKey: includeDraftTargets
      ? [BLENDABLE_SCHEMA_QUERY_KEY, dataMartId, 'include-draft-targets']
      : [BLENDABLE_SCHEMA_QUERY_KEY, dataMartId],
    // `getBlendableSchema` CASTS its response rather than mapping it, so the declared shape is a
    // claim about the wire, not a fact: an older or partial payload arrives with an array missing
    // and the first unguarded `for…of` takes the caller down through its error boundary.
    // Normalized once here so every reader can trust the three arrays it is typed to hold.
    queryFn: async (): Promise<BlendableSchema> => {
      const raw = (await dataMartRelationshipService
        .getBlendableSchema(
          dataMartId,
          includeDraftTargets ? { includeDraftTargets: true } : undefined,
          { skipLoadingIndicator: true }
        )
        .catch((error: unknown) => {
          // Callers degrade quietly without it — compact ERD cards, own-Data-Mart-only formula
          // autocomplete — so leave a trace that makes those states diagnosable.
          console.error('Failed to load blendable schema', error);
          throw error;
        })) as Partial<BlendableSchema>;
      return {
        ...raw,
        nativeFields: raw.nativeFields ?? [],
        blendedFields: raw.blendedFields ?? [],
        availableSources: raw.availableSources ?? [],
      } as BlendableSchema;
    },
    enabled: !!dataMartId,
  });
}
