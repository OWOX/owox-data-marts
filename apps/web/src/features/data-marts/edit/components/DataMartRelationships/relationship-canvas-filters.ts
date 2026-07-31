/**
 * Diagram filter model, shared by RelationshipCanvas and
 * DataMartRelationshipsContent. Lives in its own module so the (lazy-loaded)
 * canvas chunk is not pulled into the main bundle just for these helpers.
 */

/** Status filter for target data marts on the diagram. */
export type RelationshipStatusFilter = 'all' | 'PUBLISHED' | 'DRAFT';

export const RELATIONSHIP_STATUS_FILTER_OPTIONS: {
  value: RelationshipStatusFilter;
  label: string;
}[] = [
  { value: 'all', label: 'All' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'DRAFT', label: 'Draft' },
];

export function parseRelationshipStatusFilter(value: string | null): RelationshipStatusFilter {
  return value === 'PUBLISHED' || value === 'DRAFT' ? value : 'all';
}
