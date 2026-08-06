import type { TransientRelationshipRow } from '../../../shared/types/relationship.types';

/**
 * Relationship filter model, shared by the toolbar in
 * DataMartRelationshipsContent, the list view and the (lazy-loaded)
 * RelationshipCanvas. Lives in its own module so the canvas chunk is not
 * pulled into the main bundle just for these helpers.
 */

/** Status filter for target data marts, applied to both the list and the diagram. */
export type RelationshipStatusFilter = 'all' | 'PUBLISHED' | 'DRAFT';

export const RELATIONSHIP_STATUS_FILTER_OPTIONS: {
  value: RelationshipStatusFilter;
  label: string;
}[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'PUBLISHED', label: 'Published only' },
  { value: 'DRAFT', label: 'Draft only' },
];

export function parseRelationshipStatusFilter(value: string | null): RelationshipStatusFilter {
  return value === 'PUBLISHED' || value === 'DRAFT' ? value : 'all';
}

export interface RelationshipRowFilters {
  showLooped: boolean;
  statusFilter: RelationshipStatusFilter;
}

/**
 * Apply the toolbar filters to the flattened list rows with the same
 * semantics as the diagram (`buildRelationshipFlow`): a filtered-out
 * relationship also drops its whole subtree, because the children are only
 * reachable through the hidden parent. Rows arrive in graph order (parents
 * before children), which the parent-path lookup below relies on.
 */
export function filterTransientRows(
  rows: TransientRelationshipRow[],
  { showLooped, statusFilter }: RelationshipRowFilters
): TransientRelationshipRow[] {
  const hiddenPaths = new Set<string>();
  const result: TransientRelationshipRow[] = [];
  for (const row of rows) {
    const lastDot = row.aliasPath.lastIndexOf('.');
    const parentPath = lastDot === -1 ? '' : row.aliasPath.slice(0, lastDot);
    const droppedDirectly =
      ((row.isCycleStub ?? false) && !showLooped) ||
      (statusFilter !== 'all' && row.relationship.targetDataMart.status !== statusFilter);
    if (droppedDirectly || hiddenPaths.has(parentPath)) {
      hiddenPaths.add(row.aliasPath);
      continue;
    }
    result.push(row);
  }
  return result;
}
