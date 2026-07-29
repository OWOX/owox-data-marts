import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import type { AxiosRequestConfig } from '../../../../app/api';
import { dataMartService } from '../../shared/services/data-mart.service';
import type { DataMartSchema } from '../../shared/types/data-mart-schema.types';
import { modelCanvasService } from '../api/model-canvas.service';
import type { CanvasNodeField, ModelCanvasData, ModelCanvasNode } from './types';

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
  nodes: ModelCanvasNode[],
  config: AxiosRequestConfig
): Promise<ModelCanvasNode[]> {
  const enriched = [...nodes];
  const detailConfig: AxiosRequestConfig = {
    ...config,
    skipLoadingIndicator: true,
    skipErrorToast: true,
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
        fields: mapSchemaFields(detail.schema),
      };
    });
  }

  return enriched;
}

export function useModelCanvas(storageId: string | null) {
  const { projectId = '' } = useParams<{ projectId: string }>();

  return useQuery({
    queryKey: ['model-canvas', projectId, storageId],
    queryFn: async ({ signal }): Promise<ModelCanvasData> => {
      const id = storageId ?? '';
      const config = { signal };
      const [nodes, edges] = await Promise.all([
        modelCanvasService.getDataMarts(id, config),
        modelCanvasService.getEdges(id, config),
      ]);
      const enrichedNodes = await enrichNodes(nodes, config);
      return { nodes: enrichedNodes, edges };
    },
    enabled: Boolean(storageId),
  });
}
