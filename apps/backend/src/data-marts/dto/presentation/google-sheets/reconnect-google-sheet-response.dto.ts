import { ApiProperty } from '@nestjs/swagger';

/**
 * Result of reconnecting a report to a sheet. The frontend uses `created` to tell
 * the user which of the two things happened — we made a sheet, or we adopted one
 * that was already in the spreadsheet (in which case the next run writes into it).
 */
export class ReconnectGoogleSheetResponseDto {
  @ApiProperty({
    example: '1AbCdEfGhIjKlMnOpQrStUvWxYz',
    description: 'ID of the spreadsheet the report writes to (unchanged by this call)',
  })
  spreadsheetId: string;

  @ApiProperty({
    example: 182736451,
    description: 'Numeric ID (gid) of the sheet the report is now connected to',
  })
  sheetId: number;

  @ApiProperty({
    example: 'Revenue by channel',
    description: 'Title of the sheet the report is now connected to',
  })
  sheetTitle: string;

  @ApiProperty({
    example: true,
    description: 'True when the sheet was created, false when an existing sheet was reused',
  })
  created: boolean;
}
