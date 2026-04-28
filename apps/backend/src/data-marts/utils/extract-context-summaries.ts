export interface ContextSummary {
  id: string;
  name: string;
}

/**
 * Extracts context summary objects from a join-table relation array.
 * Each element is expected to have a `.context` property (the loaded Context entity).
 * Entries where the Context relation was not loaded are filtered out.
 */
export function extractContextSummaries(
  contextRelations: { context?: { id: string; name: string } }[] | undefined
): ContextSummary[] {
  return (contextRelations ?? [])
    .filter((c): c is { context: { id: string; name: string } } => !!c.context)
    .map(c => ({ id: c.context.id, name: c.context.name }));
}
