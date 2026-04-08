import { ApiService } from '../../../../services';
import type {
  BlendableSchema,
  BlendedFieldsConfig,
  CreateRelationshipRequest,
  DataMartRelationship,
  UpdateRelationshipRequest,
} from '../types/relationship.types';

/**
 * Service for data mart relationship operations.
 * Provides CRUD operations for relationships and blendable schema access.
 */
class DataMartRelationshipService extends ApiService {
  /**
   * Separate service instance for endpoints outside /data-marts base path.
   */
  private readonly storageApiService: ApiService;

  constructor() {
    super('/data-marts');
    this.storageApiService = new ApiService('');
  }

  /**
   * Get all relationships for a data mart.
   * @param dataMartId Data mart ID
   */
  async getRelationships(dataMartId: string): Promise<DataMartRelationship[]> {
    return this.get<DataMartRelationship[]>(`/${dataMartId}/relationships`);
  }

  /**
   * Create a new relationship for a data mart.
   * @param dataMartId Data mart ID
   * @param request Relationship creation request
   */
  async createRelationship(
    dataMartId: string,
    request: CreateRelationshipRequest
  ): Promise<DataMartRelationship> {
    return this.post<DataMartRelationship>(`/${dataMartId}/relationships`, request);
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
    request: UpdateRelationshipRequest
  ): Promise<DataMartRelationship> {
    return this.patch<DataMartRelationship>(`/${dataMartId}/relationships/${relId}`, request);
  }

  /**
   * Delete a relationship.
   * @param dataMartId Data mart ID
   * @param relId Relationship ID
   */
  async deleteRelationship(dataMartId: string, relId: string): Promise<void> {
    return this.delete(`/${dataMartId}/relationships/${relId}`);
  }

  /**
   * Get the blendable schema for a data mart.
   * @param dataMartId Data mart ID
   */
  async getBlendableSchema(dataMartId: string): Promise<BlendableSchema> {
    return this.get<BlendableSchema>(`/${dataMartId}/blendable-schema`);
  }

  /**
   * Get all relationships for a data storage.
   * Uses a different base path (/data-storages) than the primary service.
   * @param storageId Data storage ID
   */
  async updateBlendedFieldsConfig(
    dataMartId: string,
    config: BlendedFieldsConfig | null
  ): Promise<unknown> {
    return this.put(`/${dataMartId}/blended-fields-config`, {
      blendedFieldsConfig: config,
    });
  }

  async getRelationshipsByStorage(storageId: string): Promise<DataMartRelationship[]> {
    return this.storageApiService.get<DataMartRelationship[]>(
      `/data-storages/${storageId}/relationships`
    );
  }
}

export const dataMartRelationshipService = new DataMartRelationshipService();
