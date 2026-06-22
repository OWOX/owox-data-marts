import { ApiProperty } from '@nestjs/swagger';

/**
 * Identifiers of a freshly auto-created Google Sheet. The frontend builds the
 * document URL from these (e.g. via getGoogleSheetTabUrl) and inserts it into
 * the report's Document Link field.
 */
export class CreateGoogleSheetDocumentResponseDto {
  @ApiProperty({
    example: '1AbCdEfGhIjKlMnOpQrStUvWxYz',
    description: 'ID of the newly created Google Spreadsheet',
  })
  spreadsheetId: string;

  @ApiProperty({
    example: 0,
    description: 'Numeric ID (gid) of the first sheet in the new spreadsheet',
  })
  sheetId: number;
}
