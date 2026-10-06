import type { QueryClient } from '@tanstack/react-query';
import { BLENDABLE_SCHEMA_QUERY_KEY } from '../../../shared/hooks/blendable-schema-query-key';
import type {
  AvailableSource,
  BlendableSchema,
  BlendedFieldsConfig,
  DataMartRelationship,
  RelationshipGraph,
} from '../../../shared/types/relationship.types';

/**
 * Applies a saved description to the loaded graph without replacing the graph: every node of
 * that relationship (a direct join and its transient reuses share one id) gets the new text.
 * Only the description is taken from the response — it is the one field the PATCH sent, and a
 * response that overtook a Join Settings save would otherwise drag an older alias or join
 * conditions back into the UI. Returns the same graph instance when nothing matched.
 */
export function applyRelationshipDescriptionToGraph(
  graph: RelationshipGraph,
  updated: DataMartRelationship
): RelationshipGraph {
  if (!graph.nodes.some(node => node.relationship.id === updated.id)) return graph;
  return {
    ...graph,
    nodes: graph.nodes.map(node =>
      node.relationship.id === updated.id
        ? { ...node, relationship: { ...node.relationship, description: updated.description } }
        : node
    ),
  };
}

/**
 * The blendable schema publishes the effective description of every join node (the per-join
 * override when set, otherwise the relationship's text) for MCP and the report column picker.
 * A description save only moves that one field, so the cached schema is patched instead of
 * refetched — a full schema round trip after every typing pause is wasted work. Two cases
 * still need the network: nothing cached yet (the initial load is on the wire or failed), and
 * a fetch already in flight, whose response predates the save and would overwrite the patch.
 * Invalidation covers both — it cancels the in-flight refetch and starts one that sees the
 * committed description.
 *
 * `config` is the blended fields config of `dataMartId`; its per-join overrides win over the
 * relationship's own text.
 */
export function patchBlendableSchemaJoinDescription(
  queryClient: QueryClient,
  dataMartId: string,
  config: BlendedFieldsConfig,
  updated: DataMartRelationship
): void {
  const queryKey = [BLENDABLE_SCHEMA_QUERY_KEY, dataMartId];
  const overrides = new Map<string, string>();
  for (const source of config.sources) {
    if (source.description) overrides.set(source.path, source.description);
  }
  queryClient.setQueriesData<BlendableSchema>({ queryKey }, cached => {
    if (!cached) return cached;
    return {
      ...cached,
      availableSources: cached.availableSources.map(source => {
        if (source.relationshipId !== updated.id) return source;
        const joinDescription = overrides.get(source.aliasPath) ?? updated.description;
        const next: AvailableSource = { ...source };
        if (joinDescription) next.joinDescription = joinDescription;
        else delete next.joinDescription;
        return next;
      }),
    };
  });
  const hasCachedData = queryClient
    .getQueriesData<BlendableSchema>({ queryKey })
    .some(([, data]) => data !== undefined);
  if (!hasCachedData || queryClient.isFetching({ queryKey }) > 0) {
    void queryClient.invalidateQueries({ queryKey: [BLENDABLE_SCHEMA_QUERY_KEY] });
  }
}
