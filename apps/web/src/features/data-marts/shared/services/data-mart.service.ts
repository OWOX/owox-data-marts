import { ApiService } from '../../../../services';
import type {
  CreateDataMartRequestDto,
  CreateDataMartResponseDto,
  DataMartListResponseDto,
  DataMartResponseDto,
  UpdateDataMartRequestDto,
  UpdateDataMartDefinitionRequestDto,
  UpdateDataMartSchemaRequestDto,
  SqlValidationResponseDto,
  SqlValidationRequestDto,
} from '../types/api';
import type { DataMartRun, DataMartRunItem } from '../../edit/model/types/data-mart-run';

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
   * @param data Definition update data (specific type based on definition type)
   * @returns Promise with updated data mart
   */
  async updateDataMartDefinition(
    id: string,
    data: UpdateDataMartDefinitionRequestDto
  ): Promise<DataMartResponseDto> {
    return this.put<DataMartResponseDto>(`/${id}/definition`, data, { timeout: 180000 });
  }

  /**
   * Publish a data mart
   * @param id Data mart ID
   * @returns Promise with updated data mart
   */
  async publishDataMart(id: string): Promise<DataMartResponseDto> {
    return this.put<DataMartResponseDto>(`/${id}/publish`, undefined, { timeout: 180000 });
  }

  /**
   * Run a data mart
   * @param id Data mart ID
   * @param payload Payload for the manual run. If not provided, the data mart will be run with the default payload.
   * The payload is specific to the data mart definition type.
   * For example, for a connector data mart, the payload is the connector configuration fields with unknown structure.
   * @returns Promise with updated data mart
   */
  async runDataMart(id: string, payload: Record<string, unknown>): Promise<DataMartResponseDto> {
    return this.post<DataMartResponseDto>(`/${id}/manual-run`, { payload: payload });
  }

  /**
   * Cancel a data mart run
   * @param id Data mart ID
   * @param runId Run ID
   * @returns Promise<void>
   */
  async cancelDataMartRun(id: string, runId: string): Promise<void> {
    await this.post(`/${id}/runs/${runId}/cancel`);
  }

  /**
   * Actualize a data mart schema
   * @param id Data mart ID
   * @returns Promise with updated data mart
   */
  async actualizeDataMartSchema(id: string): Promise<DataMartResponseDto> {
    return this.post<DataMartResponseDto>(`/${id}/actualize-schema`, undefined, {
      timeout: 180000,
    });
  }

  /**
   * Update a data mart schema
   * @param id Data mart ID
   * @param data Schema update data
   * @returns Promise with updated data mart
   */
  async updateDataMartSchema(
    id: string,
    data: UpdateDataMartSchemaRequestDto
  ): Promise<DataMartResponseDto> {
    return this.put<DataMartResponseDto>(`/${id}/schema`, data, { timeout: 180000 });
  }

  /**
   * Validate SQL query
   * @param id Data mart ID
   * @param sql SQL query to validate
   * @param abortController Optional AbortController to cancel the request
   * @param skipLoading Optional flag to skip global loading indicator
   * @returns Promise with validation result
   */
  async validateSql(
    id: string,
    sql: string,
    abortController?: AbortController,
    skipLoading = true
  ): Promise<SqlValidationResponseDto> {
    const data: SqlValidationRequestDto = { sql };
    const config = {
      ...(abortController ? { signal: abortController.signal } : {}),
      skipLoadingIndicator: skipLoading,
      timeout: 180000,
    };
    return this.post<SqlValidationResponseDto>(`/${id}/sql-dry-run`, data, config);
  }

  /**
   * Get run history for a data mart
   * @param id Data mart ID
   * @param limit Number of runs to fetch (default: 5)
   * @param offset Number of runs to skip (default: 0)
   * @returns Promise with run history
   */
  async getDataMartRuns(id: string, limit = 5, offset = 0): Promise<DataMartRunItem[]> {
    const response = await this.get<DataMartRun>(`/${id}/runs`, { limit, offset });
    return response.runs;
  }
}

// Create a singleton instance
export const dataMartService = new DataMartService();
