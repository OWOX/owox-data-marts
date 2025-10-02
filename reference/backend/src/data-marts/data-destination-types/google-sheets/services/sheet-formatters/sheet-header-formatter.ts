import { sheets_v4 } from 'googleapis';
import { Injectable } from '@nestjs/common';

/**
 * Service for formatting headers in Google Sheets
 * Provides methods to create header formatting requests
 */
@Injectable()
export class SheetHeaderFormatter {
  /**
   * Background color for header cells
   * Light gray color (RGB: 243, 243, 243)
   */
  private static readonly HEADER_BACKGROUND_COLOR = {
    red: 243 / 255,
    green: 243 / 255,
    blue: 243 / 255,
    alpha: 1.0,
  };

  /**
   * Text color for header cells
   * Dark gray color (RGB: 25, 25, 25)
   */
  private static readonly HEADER_TEXT_COLOR = {
    red: 0.1,
    green: 0.1,
    blue: 0.1,
    alpha: 1.0,
  };

  /**
   * Creates a request to format the header row
   * Applies background color and bold text to the header row
   *
   * @param sheetId - ID of the sheet to format
   * @param columnsCount - Number of columns to format
   * @returns Google Sheets API request object for header formatting
   */
  public createHeaderFormatRequest(
    sheetId: number,
    columnsCount: number
  ): sheets_v4.Schema$Request {
    return {
      repeatCell: {
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: columnsCount,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: SheetHeaderFormatter.HEADER_BACKGROUND_COLOR,
            textFormat: {
              bold: true,
              foregroundColor: SheetHeaderFormatter.HEADER_TEXT_COLOR,
            },
          },
        },
        fields: 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
      },
    };
  }
}
