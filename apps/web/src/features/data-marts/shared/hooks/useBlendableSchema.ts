import { useQuery } from '@tanstack/react-query';
import { dataMartRelationshipService } from '../services/data-mart-relationship.service';
import type { BlendableSchema } from '../types/relationship.types';
import { BLENDABLE_SCHEMA_QUERY_KEY } from './blendable-schema-query-key';

/**
 * The one way to read a Data Mart's blendable schema.
 *
 * Several parts of the Data Mart editor need it at once — the joined Data Marts card, the
 * calculated-field formula editor's joined-field autocomplete, the report column picker — and
 * they render side by side. Going through one React Query entry is what keeps them agreeing:
 * whoever asks first fetches, the rest read the same object, and the invalidation any of them
 * fires after a relationship or blended-config change refreshes all of them at once.
 *
 * `skipLoadingIndicator` because every caller renders its own pending state; a global overlay for
 * a request that is a detail of one card is noise.
 */
export function useBlendableSchema(dataMartId: string) {
  return useQuery({
    queryKey: [BLENDABLE_SCHEMA_QUERY_KEY, dataMartId],
    // `getBlendableSchema` CASTS its response rather than mapping it, so the declared shape is a
    // claim about the wire, not a fact: an older or partial payload arrives with an array missing
    // and the first unguarded `for…of` takes the caller down through its error boundary.
    // Normalized once here so every reader can trust the three arrays it is typed to hold.
    queryFn: async (): Promise<BlendableSchema> => {
      const raw = (await dataMartRelationshipService
        .getBlendableSchema(dataMartId, { skipLoadingIndicator: true })
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
