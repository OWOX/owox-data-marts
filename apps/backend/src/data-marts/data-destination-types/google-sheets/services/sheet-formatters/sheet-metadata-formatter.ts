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
   * @returns Google Sheets API request object for metadata note
   */
  public createMetadataNoteRequest(
    sheetId: number,
    dateFormatted: string,
    dataMartTitle: string
  ): sheets_v4.Schema$Request {
    const metadataNote =
      `Imported via OWOX Data Marts Community Edition at ${dateFormatted}\n` +
      `Data Mart: ${dataMartTitle}`;

    return {
      repeatCell: {
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 1,
        },
        cell: {
          note: metadataNote,
        },
        fields: 'note',
      },
    };
  }
}
