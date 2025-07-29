import { ApiService } from '../../../../services';
import type {
  CreateDataDestinationRequestDto,
  DataDestinationResponseDto,
  UpdateDataDestinationRequestDto,
} from './types';

/**
 * Data Destination Service
 * Specializes in data destination operations using the generic ApiService
 */
export class DataDestinationService extends ApiService {
  /**
   * Creates a new DataDestinationService instance
   */
  constructor() {
    super('/data-destinations');
  }

  /**
   * Fetch all data destinations
   * @returns Promise with data destination list response
   */
  async getDataDestinations(): Promise<DataDestinationResponseDto[]> {
    return this.get<DataDestinationResponseDto[]>('/');
  }

  /**
   * Get a data destination by ID
   * @param id Data destination ID
   * @returns Promise with data destination response
   */
  async getDataDestinationById(id: string): Promise<DataDestinationResponseDto> {
    return this.get<DataDestinationResponseDto>(`/${id}`);
  }

  /**
   * Create a new data destination
   * @param data Data destination creation data
   * @returns Promise with created data destination
   */
  async createDataDestination(
    data: CreateDataDestinationRequestDto
  ): Promise<DataDestinationResponseDto> {
    return this.post<DataDestinationResponseDto>('', data);
  }

  /**
   * Update an existing data destination
   * @param id Data destination ID
   * @param data Data to update
   * @returns Promise with updated data destination
   */
  async updateDataDestination(
    id: string,
    data: UpdateDataDestinationRequestDto
  ): Promise<DataDestinationResponseDto> {
    return this.put<DataDestinationResponseDto>(`/${id}`, data);
  }

  /**
   * Delete a data destination
   * @param id Data destination ID
   */
  async deleteDataDestination(id: string): Promise<void> {
    return this.delete(`/${id}`);
  }

  /**
   * Rotate secret key for a data destination
   * @param id Data destination ID
   * @returns Promise with updated data destination
   */
  async rotateSecretKey(id: string): Promise<DataDestinationResponseDto> {
    return this.post<DataDestinationResponseDto>(`/${id}/rotate-secret-key`);
  }
}

// Create a singleton instance
export const dataDestinationService = new DataDestinationService();
