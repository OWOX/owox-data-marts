import { ApiService } from '../../../../services';
import type {
  CreateDataDestinationRequestDto,
  DataDestinationResponseDto,
  UpdateDataDestinationRequestDto,
  DataDestinationImpactResponseDto,
} from './types';

/**
 * Identifiers of an auto-created Google Sheet, returned by the "Create document" flow.
 */
export interface CreateGoogleSheetDocumentResponseDto {
  spreadsheetId: string;
  sheetId: number;
  /**
   * True when a Drive folder was configured but the document was created in the
   * Drive root instead (the connected OAuth token lacks a Drive scope).
   */
  placedInRoot?: boolean;
  /** Whether the document was shared with the requesting user. */
  sharedWithRequester?: boolean;
}

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
   * MCP connect-flow: creates a Google Sheets destination bound to a just-connected Credential.
   * Sharing defaults are enforced server-side (not client-controlled).
   */
  async createConnectGoogleSheetsDestination(data: {
    title: string;
    reusableCredentialId: string;
  }): Promise<DataDestinationResponseDto> {
    return this.post<DataDestinationResponseDto>('/connect/google-sheets', data);
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
   * Get usage impact for a data destination — distinct counts of reports and
   * data marts that reference it. Used to populate the pre-delete blocked
   * popup so admins can see what is blocking removal.
   */
  async getDataDestinationImpact(id: string): Promise<DataDestinationImpactResponseDto> {
    return this.get<DataDestinationImpactResponseDto>(`/${id}/impact`);
  }

  /**
   * Rotate secret key for a data destination
   * @param id Data destination ID
   * @returns Promise with updated data destination
   */
  async rotateSecretKey(id: string): Promise<DataDestinationResponseDto> {
    return this.post<DataDestinationResponseDto>(`/${id}/rotate-secret-key`);
  }

  /**
   * Auto-create a new Google Sheet for a Google Sheets destination (OAuth).
   * Returns the new spreadsheet/sheet identifiers; the caller builds the URL.
   * @param id Data destination ID
   * @param data Optional title for the new sheet
   */
  async createGoogleSheetDocument(
    id: string,
    data: { title?: string }
  ): Promise<CreateGoogleSheetDocumentResponseDto> {
    return this.post<CreateGoogleSheetDocumentResponseDto>(`/${id}/google-sheets/documents`, data);
  }
}

// Create a singleton instance
export const dataDestinationService = new DataDestinationService();
