import { ApiService } from '../../../../../services';
import type { CreateReportRequestDto, ReportResponseDto, UpdateReportRequestDto } from './types';
import type { AxiosRequestConfig } from '../../../../../app/api';

/**
 * Report Service
 * Specializes in report operations using the generic ApiService
 */
export class ReportService extends ApiService {
  /**
   * Creates a new ReportService instance
   */
  constructor() {
    super('/reports');
  }

  /**
   * Create a new report
   * @param data Report creation data
   * @returns Promise with created report
   */
  async createReport(data: CreateReportRequestDto): Promise<ReportResponseDto> {
    return this.post<ReportResponseDto>('', data);
  }

  /**
   * Get a report by ID
   * @param id Report ID
   * @returns Promise with report response
   */
  async getReportById(id: string): Promise<ReportResponseDto> {
    return this.get<ReportResponseDto>(`/${id}`);
  }

  /**
   * List reports by data mart ID
   * @param dataMartId Data mart ID
   * @param config
   * @returns Promise with list of reports
   */
  async getReportsByDataMartId(
    dataMartId: string,
    config?: AxiosRequestConfig
  ): Promise<ReportResponseDto[]> {
    return this.get<ReportResponseDto[]>(`/data-mart/${dataMartId}`, undefined, config);
  }

  /**
   * List reports by insight template ID
   * @param dataMartId Data mart ID
   * @param insightTemplateId Insight template ID
   * @param config
   * @returns Promise with list of reports for the insight template
   */
  async getReportsByInsightTemplateId(
    dataMartId: string,
    insightTemplateId: string,
    config?: AxiosRequestConfig
  ): Promise<ReportResponseDto[]> {
    return this.get<ReportResponseDto[]>(
      `/data-mart/${dataMartId}/insight-template/${insightTemplateId}`,
      undefined,
      config
    );
  }

  /**
   * List reports by project
   * @returns Promise with list of reports
   */
  async getReportsByProject(): Promise<ReportResponseDto[]> {
    return this.get<ReportResponseDto[]>('/');
  }

  /**
   * Update an existing report
   * @param id Report ID
   * @param data Data to update
   * @returns Promise with updated report
   */
  async updateReport(id: string, data: UpdateReportRequestDto): Promise<ReportResponseDto> {
    return this.put<ReportResponseDto>(`/${id}`, data);
  }

  /**
   * Delete a report
   * @param id Report ID
   */
  async deleteReport(id: string): Promise<void> {
    return this.delete(`/${id}`);
  }

  /**
   * Run a report
   * @param id Report ID
   */
  async runReport(id: string): Promise<void> {
    return this.post(`/${id}/run`);
  }

  /**
   * Get the generated SQL for a report
   * @param id Report ID
   * @returns Object containing the generated SQL string
   */
  async getGeneratedSql(id: string): Promise<{ sql: string }> {
    return this.get<{ sql: string }>(`/${id}/generated-sql`);
  }

  /**
   * Copy a report as a new Data Mart
   * @param id Report ID
   * @returns Promise with the created data mart id
   */
  async copyAsDataMart(id: string): Promise<{ dataMartId: string }> {
    return this.post<{ dataMartId: string }>(`/${id}/copy-as-data-mart`);
  }
}

// Create a singleton instance
export const reportService = new ReportService();
