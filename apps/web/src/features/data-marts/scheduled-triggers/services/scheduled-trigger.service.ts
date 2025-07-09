import { ApiService } from '../../../../services';
import type {
  CreateScheduledTriggerRequestApiDto,
  ScheduledTriggerListResponseApiDto,
  ScheduledTriggerResponseApiDto,
  UpdateScheduledTriggerRequestApiDto,
} from '../model/api';

/**
 * Scheduled Trigger Service
 * Specializes in scheduled trigger operations using the generic ApiService
 */
export class ScheduledTriggerService extends ApiService {
  /**
   * Creates a new ScheduledTriggerService instance
   */
  constructor() {
    super('/data-marts');
  }

  /**
   * Fetch all scheduled triggers for a specific data mart
   * @param dataMartId Data mart ID
   * @returns Promise with scheduled trigger list response
   */
  async getScheduledTriggers(dataMartId: string): Promise<ScheduledTriggerListResponseApiDto> {
    return this.get<ScheduledTriggerListResponseApiDto>(`/${dataMartId}/scheduled-triggers`);
  }

  /**
   * Get a scheduled trigger by ID in the context of a data mart
   * @param dataMartId Data mart ID
   * @param triggerId Trigger ID
   * @returns Promise with scheduled trigger response
   */
  async getScheduledTrigger(
    dataMartId: string,
    triggerId: string
  ): Promise<ScheduledTriggerResponseApiDto> {
    return this.get<ScheduledTriggerResponseApiDto>(
      `/${dataMartId}/scheduled-triggers/${triggerId}`
    );
  }

  /**
   * Create a new scheduled trigger for a specific data mart
   * @param dataMartId Data mart ID
   * @param data Scheduled trigger creation data
   * @returns Promise with created scheduled trigger
   */
  async createScheduledTrigger(
    dataMartId: string,
    data: CreateScheduledTriggerRequestApiDto
  ): Promise<ScheduledTriggerResponseApiDto> {
    return this.post<ScheduledTriggerResponseApiDto>(`/${dataMartId}/scheduled-triggers`, data);
  }

  /**
   * Update an existing scheduled trigger in the context of a data mart
   * @param dataMartId Data mart ID
   * @param triggerId Trigger ID
   * @param data Data to update
   * @returns Promise with updated scheduled trigger
   */
  async updateScheduledTrigger(
    dataMartId: string,
    triggerId: string,
    data: UpdateScheduledTriggerRequestApiDto
  ): Promise<ScheduledTriggerResponseApiDto> {
    return this.put<ScheduledTriggerResponseApiDto>(
      `/${dataMartId}/scheduled-triggers/${triggerId}`,
      data
    );
  }

  /**
   * Delete a scheduled trigger from a specific data mart
   * @param dataMartId Data mart ID
   * @param triggerId Trigger ID
   */
  async deleteScheduledTrigger(dataMartId: string, triggerId: string): Promise<void> {
    return this.delete(`/${dataMartId}/scheduled-triggers/${triggerId}`);
  }
}

export const scheduledTriggerService = new ScheduledTriggerService();
