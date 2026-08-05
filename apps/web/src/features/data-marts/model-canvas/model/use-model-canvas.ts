import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import type { AxiosRequestConfig } from '../../../../app/api';
import { dataMartService } from '../../shared/services/data-mart.service';
import type { DataMartSchema } from '../../shared/types/data-mart-schema.types';
import { modelCanvasService } from '../api/model-canvas.service';
import { extractDefinitionText } from './definition-text';
import type { CanvasNodeField, ModelCanvasTopologyData, ModelCanvasTopologyNode } from './types';

const SILENT_REQUEST_OPTIONS = {
  skipLoadingIndicator: true,
  skipErrorToast: true,
} as const;

/** Fetch detail for at most this many marts at once, to avoid a request stampede. */
const ENRICH_CONCURRENCY = 6;

function mapSchemaFields(schema: DataMartSchema | null | undefined): CanvasNodeField[] {
  if (!schema?.fields) return [];
  return schema.fields.map(field => ({
    name: field.name,
    alias: field.alias?.trim() ? field.alias : field.name,
    type: field.type,
    isPrimaryKey: field.isPrimaryKey,
    isHidden: field.isHiddenForReporting ?? false,
  }));
}

/**
 * Enrich the lightweight canvas nodes with `definitionType` + `fields`, which the
 * /model-canvas/data-marts list endpoint omits. Runs in bounded-concurrency
 * batches; a failed detail fetch leaves that node compact rather than failing the
 * whole canvas.
 */
async function enrichNodes(
  nodes: ModelCanvasTopologyNode[],
  config: AxiosRequestConfig
): Promise<ModelCanvasTopologyNode[]> {
  const enriched = [...nodes];
  const detailConfig: AxiosRequestConfig = {
    ...config,
    ...SILENT_REQUEST_OPTIONS,
  } as AxiosRequestConfig;

  for (let start = 0; start < enriched.length; start += ENRICH_CONCURRENCY) {
    const batch = enriched.slice(start, start + ENRICH_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(node => dataMartService.getDataMartById(node.id, detailConfig))
    );
    results.forEach((result, index) => {
      if (result.status !== 'fulfilled') return;
      const detail = result.value;
      const target = enriched[start + index];
      enriched[start + index] = {
        ...target,
        definitionType: detail.definitionType,
        definition: extractDefinitionText(detail.definitionType, detail.definition),
        fields: mapSchemaFields(detail.schema),
      };
    });
  }

  return enriched;
}

export function useModelCanvas(storageId: string | null) {
  const { projectId = '' } = useParams<{ projectId: string }>();

  const baseQuery = useQuery({
    queryKey: ['model-canvas', projectId, storageId],
    queryFn: async ({ signal }): Promise<ModelCanvasTopologyData> => {
      const id = storageId ?? '';
      const config = { signal, ...SILENT_REQUEST_OPTIONS };
      const [nodes, edges] = await Promise.all([
        modelCanvasService.getDataMarts(id, config),
        modelCanvasService.getEdges(id, config),
      ]);
      return { nodes, edges };
    },
    enabled: Boolean(storageId),
  });

  const baseNodes = baseQuery.data?.nodes;
  const nodeIdsKey = useMemo(
    () =>
      baseNodes
        ?.map(n => n.id)
        .sort()
        .join(',') ?? '',
    [baseNodes]
  );

  // Detail enrichment runs as a follow-up query so the canvas renders immediately
  // from the lightweight list data and upgrades in place once details arrive.
  const detailsQuery = useQuery({
    queryKey: ['model-canvas-details', projectId, storageId, nodeIdsKey],
    queryFn: ({ signal }) => enrichNodes(baseNodes ?? [], { signal }),
    enabled: Boolean(storageId) && Boolean(baseNodes?.length),
  });

  // Merge by id so a base refetch never resurrects stale titles/statuses from a
  // previously enriched snapshot — details contribute only their extra fields.
  const data = useMemo((): ModelCanvasTopologyData | undefined => {
    if (!baseQuery.data) return undefined;
    const details = detailsQuery.data;
    if (!details) return baseQuery.data;
    const detailById = new Map(details.map(node => [node.id, node]));
    return {
      nodes: baseQuery.data.nodes.map(node => {
        const detail = detailById.get(node.id);
        return detail
          ? {
              ...node,
              definitionType: detail.definitionType,
              definition: detail.definition,
              fields: detail.fields,
            }
          : node;
      }),
      edges: baseQuery.data.edges,
    };
  }, [baseQuery.data, detailsQuery.data]);

  return {
    ...baseQuery,
    data,
    /**
     * True while the follow-up detail query hasn't settled — fields and
     * definitions may still be missing from the merged nodes. Consumers that
     * serialize the model (canvas export) should wait this out.
     */
    isEnriching: Boolean(baseNodes?.length) && !detailsQuery.isFetched,
  };
}
