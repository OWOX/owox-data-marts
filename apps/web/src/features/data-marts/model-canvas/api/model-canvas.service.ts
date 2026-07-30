import type { AxiosRequestConfig } from '../../../../app/api/apiClient';
import { ApiService } from '../../../../services';
import type { ModelCanvasEdge, ModelCanvasTopologyNode } from '../model/types';

interface ModelCanvasDataMartsResponseDto {
  items: ModelCanvasTopologyNode[];
  total: number;
  nextOffset: number | null;
}

interface ModelCanvasEdgesResponseDto {
  edges: ModelCanvasEdge[];
}

class ModelCanvasService extends ApiService {
  constructor() {
    super('/model-canvas');
  }

  async getDataMarts(
    storageId: string,
    config?: AxiosRequestConfig
  ): Promise<ModelCanvasTopologyNode[]> {
    const allItems: ModelCanvasTopologyNode[] = [];
    let nextOffset: number | null = 0;

    while (nextOffset !== null) {
      const page: ModelCanvasDataMartsResponseDto = await this.get<ModelCanvasDataMartsResponseDto>(
        '/data-marts',
        { storageId, offset: nextOffset },
        config
      );

      allItems.push(...page.items);
      nextOffset = page.nextOffset;
    }

    return allItems;
  }

  async getEdges(storageId: string, config?: AxiosRequestConfig): Promise<ModelCanvasEdge[]> {
    const response = await this.get<ModelCanvasEdgesResponseDto>('/edges', { storageId }, config);
    return response.edges;
  }
}

export const modelCanvasService = new ModelCanvasService();
