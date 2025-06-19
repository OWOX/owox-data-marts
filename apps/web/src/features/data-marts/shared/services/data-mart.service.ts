import { ApiService } from '../../../../services';
import type {
  CreateDataMartRequestDto,
  CreateDataMartResponseDto,
  DataMartDefinition,
  DataMartListResponseDto,
  DataMartResponseDto,
  UpdateDataMartRequestDto,
} from '../types/api';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum.ts';

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
  async createDataMart(data: CreateDataMartRequestDto): Promise<CreateDataMartResponseDto> {
    return this.post<CreateDataMartResponseDto>('', data);
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

  /**
   * Update a data mart description
   * @param id Data mart ID
   * @param description New description for the data mart (or null to remove)
   * @returns Promise with updated data mart
   */
  async updateDataMartDescription(
    id: string,
    description: string | null
  ): Promise<DataMartResponseDto> {
    return this.put<DataMartResponseDto>(`/${id}/description`, { description });
  }

  /**
   * Update a data mart title
   * @param id Data mart ID
   * @param title New title for the data mart
   * @returns Promise with updated data mart
   */
  async updateDataMartTitle(id: string, title: string): Promise<DataMartResponseDto> {
    return this.put<DataMartResponseDto>(`/${id}/title`, { title });
  }

  /**
   * Update a data mart definition
   * @param id Data mart ID
   * @param definitionType Type of definition (SQL, TABLE, VIEW, TABLE_PATTERN)
   * @param definition Definition object
   * @returns Promise with updated data mart
   */
  async updateDataMartDefinition(
    id: string,
    definitionType: DataMartDefinitionType,
    definition: DataMartDefinition
  ): Promise<DataMartResponseDto> {
    return this.put<DataMartResponseDto>(`/${id}/definition`, {
      definitionType,
      definition,
    });
  }

  /**
   * Publish a data mart
   * @param id Data mart ID
   * @returns Promise with updated data mart
   */
  async publishDataMart(id: string): Promise<DataMartResponseDto> {
    return this.put<DataMartResponseDto>(`/${id}/publish`);
  }
}

// Create a singleton instance
export const dataMartService = new DataMartService();
