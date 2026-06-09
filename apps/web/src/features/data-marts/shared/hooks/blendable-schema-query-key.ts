/**
 * Shared query key for the blendable schema request.
 * Exported so that any component fetching blendable schema uses the same
 * React Query cache entry for a given data mart.
 */
export const BLENDABLE_SCHEMA_QUERY_KEY = 'blendable-schema';
