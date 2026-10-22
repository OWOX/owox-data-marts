import type { DataMartIconValue } from '../enums/data-mart-icon.enum';

export interface ContextSummary {
  id: string;
  name: string;
  icon: DataMartIconValue | null;
}

type ContextSummarySource = { id: string; name: string; icon?: DataMartIconValue | null };

/**
 * Extracts context summary objects from a join-table relation array.
 * Each element is expected to have a `.context` property (the loaded Context entity).
 * Entries where the Context relation was not loaded are filtered out.
 */
export function extractContextSummaries(
  contextRelations: { context?: ContextSummarySource }[] | undefined
): ContextSummary[] {
  return (contextRelations ?? [])
    .filter((c): c is { context: ContextSummarySource } => !!c.context)
    .map(c => ({ id: c.context.id, name: c.context.name, icon: c.context.icon ?? null }));
}
