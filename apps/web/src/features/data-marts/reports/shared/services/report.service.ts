import { ApiService } from '../../../../../services';
import type {
  CreateReportRequestDto,
  ReconnectSheetResponseDto,
  ReportResponseDto,
  UpdateReportRequestDto,
} from './types';
import type { AxiosRequestConfig } from '../../../../../app/api';

const PROJECT_REPORTS_FETCH_PAGE_SIZE = 100;

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
   * @param config Additional axios config (e.g. `skipErrorToast` for background polling)
   * @returns Promise with report response
   */
  async getReportById(id: string, config?: AxiosRequestConfig): Promise<ReportResponseDto> {
    return this.get<ReportResponseDto>(`/${id}`, undefined, config);
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
  async getReportsByProject(limit?: number, offset?: number): Promise<ReportResponseDto[]> {
    if (limit === undefined && offset === undefined) {
      const reports: ReportResponseDto[] = [];
      let nextOffset = 0;
      let fetchedCount: number;

      do {
        const response = await this.get<ReportResponseDto[]>('/', {
          limit: PROJECT_REPORTS_FETCH_PAGE_SIZE,
          offset: nextOffset,
        });
        reports.push(...response);
        fetchedCount = response.length;
        nextOffset += PROJECT_REPORTS_FETCH_PAGE_SIZE;
      } while (fetchedCount === PROJECT_REPORTS_FETCH_PAGE_SIZE);

      return reports;
    }

    const params = {
      ...(limit !== undefined
        ? { limit }
        : offset !== undefined
          ? { limit: PROJECT_REPORTS_FETCH_PAGE_SIZE }
          : {}),
      ...(offset !== undefined ? { offset } : {}),
    };

    return this.get<ReportResponseDto[]>('/', params);
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
   * Point a Google Sheets report at a sheet named after the report, creating
   * that sheet when the spreadsheet has none. Repairs a report whose sheet was
   * deleted. No request body — the backend derives the name from the report.
   * @param id Report ID
   * @returns Which sheet the report is connected to now, and whether it was created
   */
  async reconnectSheet(id: string): Promise<ReconnectSheetResponseDto> {
    return this.post<ReconnectSheetResponseDto>(`/${id}/google-sheets/reconnect-sheet`, {});
  }

  /**
   * Get the generated SQL for a report
   * @param id Report ID
   * @returns The generated SQL plus whether the caller has maintenance access to the
   *          source data mart (drives the dry-run validator / "Copy as Data Mart" actions)
   */
  async getGeneratedSql(id: string): Promise<{ sql: string; canModifySource: boolean }> {
    return this.get<{ sql: string; canModifySource: boolean }>(`/${id}/generated-sql`);
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
