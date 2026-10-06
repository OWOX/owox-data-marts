import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useParams } from 'react-router';
import {
  applyRelationshipDescriptionToGraph,
  patchBlendableSchemaJoinDescription,
} from '../../edit/components/DataMartRelationships/relationship-description-patches';
import { buildSourceList } from '../../edit/components/DataMartRelationships/source-entries';
import { BLENDABLE_SCHEMA_QUERY_KEY } from '../../shared/hooks/blendable-schema-query-key';
import { useBlendableSchema } from '../../shared/hooks/useBlendableSchema';
import { dataMartRelationshipService } from '../../shared/services/data-mart-relationship.service';
import type {
  DataMartRelationship,
  RelationshipGraph,
} from '../../shared/types/relationship.types';
import {
  relationshipSourceQueryKey,
  type RelationshipConfigEditor,
} from './use-relationship-source-config';

const SILENT_REQUEST_OPTIONS = {
  skipLoadingIndicator: true,
  skipErrorToast: true,
} as const;

const EMPTY_ALIASES: string[] = [];

/**
 * A Join Settings save replaces the relationship in the loaded graph. The direct join's alias
 * path is its SQL alias, so a rename moves the path too — the Report Fields tab finds the join's
 * fields by that path once the blendable schema reloads.
 */
function applyRelationshipToGraph(
  graph: RelationshipGraph,
  updated: DataMartRelationship
): RelationshipGraph {
  return {
    ...graph,
    nodes: graph.nodes.map(node =>
      node.depth === 1 && node.relationship.id === updated.id
        ? { ...node, relationship: updated, aliasPath: updated.targetAlias }
        : node
    ),
  };
}

interface UseRelationshipDetailsOptions {
  relationshipId: string;
  /** The Data Mart that defines the relationship; its Data Setup edits the same settings. */
  sourceDataMartId: string;
  /** The storage the Models canvas shows — refreshed after a change to an arrow. */
  storageId: string;
  /** The editor of the source's blended fields config, shared by all of its relationships. */
  configEditor: RelationshipConfigEditor;
}

/**
 * Everything the Models canvas relationship sheet shows and edits about one relationship,
 * loaded the way the source Data Mart's Joinable Data Marts block loads it: the relationship
 * graph rooted at the source and its blendable schema, next to the source's config editor.
 */
export function useRelationshipDetails({
  relationshipId,
  sourceDataMartId,
  storageId,
  configEditor,
}: UseRelationshipDetailsOptions) {
  const queryClient = useQueryClient();
  const { projectId = '' } = useParams<{ projectId: string }>();

  const graphQueryKey = useMemo(
    () => ['model-canvas-relationship-graph', sourceDataMartId],
    [sourceDataMartId]
  );
  const sourceQueryKey = useMemo(
    () => relationshipSourceQueryKey(sourceDataMartId),
    [sourceDataMartId]
  );

  const graphQuery = useQuery({
    queryKey: graphQueryKey,
    queryFn: ({ signal }) =>
      dataMartRelationshipService.getRelationshipGraph(sourceDataMartId, {
        signal,
        ...SILENT_REQUEST_OPTIONS,
      }),
  });
  // Draft targets included, as in the Joinable Data Marts block: their saved output schemas stay
  // configurable before publish.
  const { data: blendableSchema } = useBlendableSchema(sourceDataMartId, {
    includeDraftTargets: true,
  });

  const graphNode = useMemo(
    () =>
      graphQuery.data?.nodes.find(
        node => node.depth === 1 && node.relationship.id === relationshipId
      ) ?? null,
    [graphQuery.data, relationshipId]
  );

  // Backend enforces (sourceDataMartId, targetAlias) uniqueness; the form flags a clash inline.
  const siblingAliases = useMemo(
    () =>
      graphQuery.data?.nodes
        .filter(node => node.depth === 1 && node.relationship.id !== relationshipId)
        .map(node => node.relationship.targetAlias) ?? EMPTY_ALIASES,
    [graphQuery.data, relationshipId]
  );

  const invalidateBlendableSchema = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [BLENDABLE_SCHEMA_QUERY_KEY] });
  }, [queryClient]);

  const refreshCanvas = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['model-canvas', projectId, storageId] });
  }, [queryClient, projectId, storageId]);

  const { localConfig, localConfigRef } = configEditor;

  const sourceEntry = useMemo(() => {
    if (!blendableSchema || !graphNode) return null;
    const entries = buildSourceList(
      blendableSchema.availableSources,
      blendableSchema.blendedFields,
      localConfig
    );
    return entries.find(entry => entry.aliasPath === graphNode.aliasPath) ?? null;
  }, [blendableSchema, graphNode, localConfig]);

  // The graph is patched with the saved relationship rather than refetched. The Join Settings
  // form recognises the values it saved and keeps what was typed since; a refetch could still
  // be answered with an older state and reset the form to it.
  const onRelationshipUpdated = useCallback(
    (updated: DataMartRelationship) => {
      toast.success('Relationship updated');
      const previous = queryClient
        .getQueryData<RelationshipGraph>(graphQueryKey)
        ?.nodes.find(node => node.relationship.id === updated.id)?.relationship;
      queryClient.setQueryData<RelationshipGraph>(graphQueryKey, graph =>
        graph ? applyRelationshipToGraph(graph, updated) : graph
      );
      // Paths of joins deeper in the graph follow a renamed alias; they reload on next use.
      void queryClient.invalidateQueries({ queryKey: graphQueryKey, refetchType: 'none' });
      // A rename cascades the paths in the blended fields config server-side.
      if (previous && previous.targetAlias !== updated.targetAlias) {
        void queryClient.invalidateQueries({ queryKey: sourceQueryKey });
      }
      invalidateBlendableSchema();
      refreshCanvas();
    },
    [queryClient, graphQueryKey, sourceQueryKey, invalidateBlendableSchema, refreshCanvas]
  );

  // Autosaved while the user types, so it patches the caches in place and stays silent.
  const onRelationshipDescriptionSaved = useCallback(
    (updated: DataMartRelationship) => {
      queryClient.setQueryData<RelationshipGraph>(graphQueryKey, graph =>
        graph ? applyRelationshipDescriptionToGraph(graph, updated) : graph
      );
      patchBlendableSchemaJoinDescription(
        queryClient,
        sourceDataMartId,
        localConfigRef.current,
        updated
      );
    },
    [queryClient, graphQueryKey, sourceDataMartId, localConfigRef]
  );

  /** Resolves true once the relationship is gone; a failure is reported and resolves false. */
  const deleteRelationship = useCallback(async (): Promise<boolean> => {
    try {
      await dataMartRelationshipService.deleteRelationship(sourceDataMartId, relationshipId, {
        skipLoadingIndicator: true,
      });
    } catch {
      toast.error('Failed to delete relationship');
      return false;
    }
    toast.success('Relationship deleted');
    void queryClient.invalidateQueries({ queryKey: graphQueryKey });
    invalidateBlendableSchema();
    refreshCanvas();
    return true;
  }, [
    sourceDataMartId,
    relationshipId,
    queryClient,
    graphQueryKey,
    invalidateBlendableSchema,
    refreshCanvas,
  ]);

  return {
    relationship: graphNode?.relationship ?? null,
    /** The join's path in the source Data Mart's blended fields config. */
    aliasPath: graphNode?.aliasPath ?? null,
    isBlocked: graphNode?.isBlocked ?? false,
    /** A join back to a Data Mart already on the path, such as the source itself: reports skip it. */
    isCycleStub: graphNode?.isCycleStub ?? false,
    isLoading: graphQuery.isPending,
    /** The graph failed to load, or no longer holds the relationship. */
    isUnavailable: graphQuery.isError || (graphQuery.isSuccess && !graphNode),
    source: sourceEntry,
    siblingAliases,
    onRelationshipUpdated,
    onRelationshipDescriptionSaved,
    onAliasChange: configEditor.onAliasChange,
    onHideForReportingChange: configEditor.onHideForReportingChange,
    onFieldOverrideChange: configEditor.onFieldOverrideChange,
    onDescriptionOverrideChange: configEditor.onDescriptionOverrideChange,
    deleteRelationship,
  };
}
