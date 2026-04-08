import { sheets_v4 } from 'googleapis';
import { Injectable } from '@nestjs/common';

/**
 * Service for formatting metadata in Google Sheets
 * Provides methods to create metadata formatting requests
 */
@Injectable()
export class SheetMetadataFormatter {
  /**
   * Tab color for sheets
   * Blue color (RGB: 30, 136, 229)
   */
  private static readonly TAB_COLOR = {
    red: 30 / 255,
    green: 136 / 255,
    blue: 229 / 255,
    alpha: 1.0,
  };

  /**
   * Creates a request to set tab color and freeze the header row
   *
   * @param sheetId - ID of the sheet to format
   * @returns Google Sheets API request object for tab color and frozen header
   */
  public createTabColorAndFreezeHeaderRequest(sheetId: number): sheets_v4.Schema$Request {
    return {
      updateSheetProperties: {
        properties: {
          sheetId: sheetId,
          gridProperties: {
            frozenRowCount: 1,
          },
          tabColorStyle: {
            rgbColor: SheetMetadataFormatter.TAB_COLOR,
          },
        },
        fields: 'tabColorStyle,gridProperties.frozenRowCount',
      },
    };
  }

  /**
   * Creates a request to add a metadata note to the first cell
   *
   * @param sheetId - ID of the sheet to add the note to
   * @param dateFormatted - Formatted date string for the metadata note
   * @param dataMartTitle - Title of the data mart
   * @param dataMartUrl - URL to the data mart
   * @param isCommunityEdition - Whether the app is running in Community Edition
   * @param firstColumnDescription - Optional description for the first column
   * @returns Google Sheets API request object for metadata note
   */
  public createMetadataNoteRequest(
    sheetId: number,
    dateFormatted: string,
    dataMartTitle: string,
    dataMartUrl: string,
    isCommunityEdition: boolean,
    firstColumnDescription?: string
  ): sheets_v4.Schema$Request {
    const editionSuffix = isCommunityEdition ? ' Community Edition' : '';

    let metadataNote =
      `Imported via OWOX Data Marts${editionSuffix} at ${dateFormatted}\n` +
      `Data Mart: ${dataMartTitle}\n` +
      `Data Mart page: ${dataMartUrl}`;

    if (firstColumnDescription) {
      metadataNote += `\n---\n${firstColumnDescription}`;
    }

    return this.createNoteRequest(sheetId, metadataNote, 0, 0);
  }

  /**
   * Creates a request to add a note to a specific cell
   * @param sheetId - ID of the sheet to add the note to
   * @param note - Note text to be added
   * @param rowIndex - Row index of the cell to add the note to
   * @param columnIndex - Column index of the cell to add the note to
   * @returns Google Sheets API request object for note
   */
  public createNoteRequest(
    sheetId: number,
    note: string | null | undefined,
    rowIndex: number,
    columnIndex: number
  ): sheets_v4.Schema$Request {
    return {
      repeatCell: {
        range: {
          sheetId: sheetId,
          startRowIndex: rowIndex,
          endRowIndex: rowIndex + 1,
          startColumnIndex: columnIndex,
          endColumnIndex: columnIndex + 1,
        },
        cell: {
          note: note ?? null,
        },
        fields: 'note',
      },
    };
  }

  /**
   * Creates a request to add developer metadata to a specific sheet
   *
   * - metadataKey: "OWOX_REPORT_META"
   * - metadataValue: JSON string with reportId, dataMartId, projectId
   * - visibility: DOCUMENT (accessible to all users with document access)
   * - location: Bound to specific sheet via sheetId
   *
   * @param sheetId - ID of the sheet to associate metadata with
   * @param projectId - OWOX Project ID
   * @param dataMartId - OWOX DataMart ID
   * @param reportId - OWOX Report ID
   * @returns Google Sheets API request object for developer metadata
   */
  public createDeveloperMetadataRequest(
    sheetId: number,
    projectId: string,
    dataMartId: string,
    reportId: string
  ): sheets_v4.Schema$Request {
    return {
      createDeveloperMetadata: {
        developerMetadata: {
          metadataKey: 'OWOX_REPORT_META',
          metadataValue: this.buildOwoxMetadataValue(reportId, dataMartId, projectId),
          visibility: 'DOCUMENT',
          location: {
            sheetId,
          },
        },
      },
    };
  }

  /**
   * Creates a request to update existing developer metadata on a sheet
   *
   * @param metadataId - ID of the existing metadata to update
   * @param projectId - OWOX Project ID
   * @param dataMartId - OWOX DataMart ID
   * @param reportId - OWOX Report ID
   * @returns Google Sheets API request object for updating developer metadata
   */
  public updateDeveloperMetadataRequest(
    metadataId: number,
    projectId: string,
    dataMartId: string,
    reportId: string
  ): sheets_v4.Schema$Request {
    return {
      updateDeveloperMetadata: {
        dataFilters: [
          {
            developerMetadataLookup: {
              metadataId,
            },
          },
        ],
        developerMetadata: {
          metadataValue: this.buildOwoxMetadataValue(reportId, dataMartId, projectId),
        },
        fields: 'metadataValue',
      },
    };
  }

  private buildOwoxMetadataValue(reportId: string, dataMartId: string, projectId: string): string {
    return JSON.stringify({ reportId, dataMartId, projectId });
  }
}
