import type { AxiosRequestConfig } from '../../../../app/api';
import { ApiService } from '../../../../services';
import type { TaskStatus } from '../../../../shared/types/task-status.enum.ts';
import type {
  CreateDataStorageRequestDto,
  DataStorageListResponseDto,
  DataStorageResponseDto,
  PublishDataStorageDraftsResponseDto,
  UpdateDataStorageRequestDto,
} from './types';

interface TaskStatusResponseDto {
  status: TaskStatus;
}

export interface DataStorageValidationResponseDto {
  valid: boolean;
  errorMessage?: string;
}

export class DataStorageApiService extends ApiService {
  constructor() {
    super('/data-storages');
  }

  /**
   * Fetches a list of data storages.
   *
   * @return {Promise<DataStorageListResponseDto>} A promise that resolves to an object representing the list of data storages.
   */
  async getDataStorages(): Promise<DataStorageListResponseDto> {
    return this.get<DataStorageListResponseDto>('/');
  }

  /**
   * Retrieves the data storage information associated with the specified identifier.
   *
   * @param {string} id - The unique identifier of the data storage to retrieve.
   * @return {Promise<DataStorageResponseDto>} A promise resolving to the details of the requested data storage.
   */
  async getDataStorageById(id: string): Promise<DataStorageResponseDto> {
    return this.get<DataStorageResponseDto>(`/${id}`);
  }

  /**
   * Creates a new data storage using the provided details.
   *
   * @param {CreateDataStorageRequestDto} data - The request data required to create a new data storage.
   * @return {Promise<DataStorageResponseDto>} A promise that resolves to the response data of the created data storage.
   */
  async createDataStorage(data: CreateDataStorageRequestDto): Promise<DataStorageResponseDto> {
    return this.post<DataStorageResponseDto>('', data);
  }

  /**
   * Updates an existing data storage resource with the provided data.
   *
   * @param {string} id - The unique identifier for the data storage resource to update.
   * @param {UpdateDataStorageRequestDto} data - The new data to update the storage resource with.
   * @return {Promise<DataStorageResponseDto>} A promise that resolves to the updated data storage resource.
   */
  async updateDataStorage(
    id: string,
    data: UpdateDataStorageRequestDto
  ): Promise<DataStorageResponseDto> {
    return this.put<DataStorageResponseDto>(`/${id}`, data);
  }

  /**
   * Deletes the data storage resource with the specified identifier.
   *
   * @param {string} id - The unique identifier for the data storage resource to delete.
   * @return {Promise<void>} A promise that resolves when the data storage resource has been deleted.
   */
  async deleteDataStorage(id: string): Promise<void> {
    return this.delete(`/${id}`);
  }

  /**
   * Validates access to a data storage by its identifier.
   *
   * @param {string} id - The unique identifier of the data storage to validate.
   * @param {AxiosRequestConfig} [config] - Optional Axios request configuration.
   * @return {Promise<DataStorageValidationResponseDto>} A promise resolving to the validation result.
   */
  async validateAccess(
    id: string,
    config?: AxiosRequestConfig
  ): Promise<DataStorageValidationResponseDto> {
    return this.post<DataStorageValidationResponseDto>(`/${id}/validate-access`, {}, config);
  }

  // Publish drafts trigger API
  async createPublishDraftsTrigger(id: string): Promise<{ triggerId: string }> {
    return this.post<{ triggerId: string }>(`/${id}/publish-drafts-triggers`, undefined, {
      skipLoadingIndicator: true,
    } as AxiosRequestConfig);
  }

  async getPublishDraftsTriggerStatus(id: string, triggerId: string): Promise<TaskStatus> {
    const response = await this.get<TaskStatusResponseDto>(
      `/${id}/publish-drafts-triggers/${triggerId}/status`,
      undefined,
      { skipLoadingIndicator: true } as AxiosRequestConfig
    );
    return response.status;
  }

  async getPublishDraftsTriggerResponse(
    id: string,
    triggerId: string
  ): Promise<PublishDataStorageDraftsResponseDto> {
    return this.get<PublishDataStorageDraftsResponseDto>(
      `/${id}/publish-drafts-triggers/${triggerId}`,
      undefined,
      { skipLoadingIndicator: true } as AxiosRequestConfig
    );
  }

  async abortPublishDraftsTrigger(id: string, triggerId: string): Promise<void> {
    await this.delete(`/${id}/publish-drafts-triggers/${triggerId}`, {
      skipLoadingIndicator: true,
    } as AxiosRequestConfig);
  }
}

export const dataStorageApiService = new DataStorageApiService();
