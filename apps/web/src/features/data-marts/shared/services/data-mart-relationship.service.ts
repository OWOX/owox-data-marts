import type { AxiosRequestConfig } from '../../../../app/api/apiClient';
import { ApiService } from '../../../../services';
import type { DataMartResponseDto } from '../types/api/response/data-mart.response.dto';
import type {
  BlendableSchema,
  BlendedFieldsConfig,
  CreateRelationshipRequest,
  DataMartRelationship,
  RelationshipGraph,
  UpdateRelationshipRequest,
} from '../types/relationship.types';

/**
 * Service for data mart relationship operations.
 * Provides CRUD operations for relationships and blendable schema access.
 */
class DataMartRelationshipService extends ApiService {
  constructor() {
    super('/data-marts');
  }

  /**
   * Get the full relationship graph rooted at this data mart.
   * Backend walks the graph in one pass with a single SEE check on the root.
   */
  async getRelationshipGraph(
    dataMartId: string,
    config?: AxiosRequestConfig
  ): Promise<RelationshipGraph> {
    return this.get<RelationshipGraph>(`/${dataMartId}/relationships/graph`, undefined, config);
  }

  /**
   * Create a new relationship for a data mart.
   * @param dataMartId Data mart ID
   * @param request Relationship creation request
   * @param config Optional axios config (e.g. `skipLoadingIndicator` for silent refreshes)
   */
  async createRelationship(
    dataMartId: string,
    request: CreateRelationshipRequest,
    config?: AxiosRequestConfig
  ): Promise<DataMartRelationship> {
    return this.post<DataMartRelationship>(`/${dataMartId}/relationships`, request, config);
  }

  /**
   * Update an existing relationship.
   * @param dataMartId Data mart ID
   * @param relId Relationship ID
   * @param request Relationship update request
   */
  async updateRelationship(
    dataMartId: string,
    relId: string,
    request: UpdateRelationshipRequest,
    config?: AxiosRequestConfig
  ): Promise<DataMartRelationship> {
    return this.patch<DataMartRelationship>(
      `/${dataMartId}/relationships/${relId}`,
      request,
      config
    );
  }

  /**
   * Delete a relationship.
   * @param dataMartId Data mart ID
   * @param relId Relationship ID
   * @param config Optional axios config (e.g. `skipLoadingIndicator` for silent refreshes)
   */
  async deleteRelationship(
    dataMartId: string,
    relId: string,
    config?: AxiosRequestConfig
  ): Promise<void> {
    return this.delete(`/${dataMartId}/relationships/${relId}`, config);
  }

  /**
   * Get the blendable schema for a data mart.
   * @param dataMartId Data mart ID
   * @param config Optional axios config (e.g. `skipLoadingIndicator` for silent refreshes)
   */
  async getBlendableSchema(
    dataMartId: string,
    config?: AxiosRequestConfig
  ): Promise<BlendableSchema> {
    return this.get<BlendableSchema>(`/${dataMartId}/blendable-schema`, undefined, config);
  }

  /**
   * Replace the data mart's blended fields configuration.
   * @param dataMartId Data mart ID.
   * @param blendedFieldsConfig Full configuration to persist, or `null` to clear it.
   * @param config Optional axios config (e.g. `skipLoadingIndicator` for silent refreshes)
   * @returns The updated data mart as returned by the API.
   */
  async updateBlendedFieldsConfig(
    dataMartId: string,
    blendedFieldsConfig: BlendedFieldsConfig | null,
    config?: AxiosRequestConfig
  ): Promise<DataMartResponseDto> {
    return this.put<DataMartResponseDto>(
      `/${dataMartId}/blended-fields-config`,
      { blendedFieldsConfig },
      config
    );
  }
}

export const dataMartRelationshipService = new DataMartRelationshipService();
