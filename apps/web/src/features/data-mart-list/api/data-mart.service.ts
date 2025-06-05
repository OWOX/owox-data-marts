import { ApiService } from '../../../services';
import type { CreateDataMartRequestDto, UpdateDataMartRequestDto } from '../../../shared';
import type { DataMartResponseDto, DataMartListResponseDto } from '../../../shared';

/**
 * Data Mart Service
 * Specializes in data mart operations using the generic ApiService
 */
export class DataMartService extends ApiService {
  /**
   * Creates a new DataMartService instance
   */
  constructor() {
    super('/data-marts');
  }

  /**
   * Fetch data marts
   * @returns Promise with data mart list response
   */
  async getDataMarts(): Promise<DataMartListResponseDto> {
    return this.get<DataMartListResponseDto>('/');
  }

  /**
   * Get a data mart by ID
   * @param id Data mart ID
   * @returns Promise with data mart response
   */
  async getDataMartById(id: string): Promise<DataMartResponseDto> {
    return this.get<DataMartResponseDto>(`/${id}`);
  }

  /**
   * Create a new data mart
   * @param data Data mart creation data
   * @returns Promise with created data mart
   */
  async createDataMart(data: CreateDataMartRequestDto): Promise<DataMartResponseDto> {
    return this.post<DataMartResponseDto>('', data);
  }

  /**
   * Update an existing data mart
   * @param id Data mart ID
   * @param data Data to update
   * @returns Promise with updated data mart
   */
  async updateDataMart(id: string, data: UpdateDataMartRequestDto): Promise<DataMartResponseDto> {
    return this.patch<DataMartResponseDto>(`/${id}`, data);
  }

  /**
   * Delete a data mart
   * @param id Data mart ID
   */
  async deleteDataMart(id: string): Promise<void> {
    return this.delete(`/${id}`);
  }
}

// Create a singleton instance
export const dataMartService = new DataMartService();
