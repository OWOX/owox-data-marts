export interface RelationshipEndpoints {
  readonly sourceDataMartId: string;
  readonly targetDataMartId: string;
}

/**
 * Counts each given Data Mart's relationships the way the Models canvas card does: the ones it
 * defines plus the ones that point to it, a relationship to itself once. Data Marts without
 * relationships are absent from the result.
 */
export function countDataMartRelationships(
  relationships: readonly RelationshipEndpoints[],
  dataMartIds: readonly string[]
): Map<string, number> {
  const ids = new Set(dataMartIds);
  const counts = new Map<string, number>();
  const bump = (id: string) => {
    if (ids.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
  };

  for (const { sourceDataMartId, targetDataMartId } of relationships) {
    bump(sourceDataMartId);
    if (targetDataMartId !== sourceDataMartId) bump(targetDataMartId);
  }

  return counts;
}
