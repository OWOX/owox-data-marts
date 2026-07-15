import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { modelCanvasService } from '../api/model-canvas.service';
import { dataQualityPollingInterval } from '../../data-quality/model/data-quality.model';
import type { ModelCanvasData } from './types';

export function useModelCanvas(storageId: string | null) {
  const { projectId = '' } = useParams<{ projectId: string }>();

  return useQuery({
    queryKey: ['model-canvas', projectId, storageId],
    queryFn: async ({ signal }): Promise<ModelCanvasData> => {
      const id = storageId ?? '';
      const config = { signal, skipLoadingIndicator: true, skipErrorToast: true };
      const [nodes, edges] = await Promise.all([
        modelCanvasService.getDataMarts(id, config),
        modelCanvasService.getEdges(id, config),
      ]);
      return { nodes, edges };
    },
    enabled: Boolean(storageId),
    refetchInterval: query =>
      query.state.data?.nodes.some(
        node => dataQualityPollingInterval(node.qualitySummary.state) !== false
      )
        ? 2_000
        : false,
  });
}
