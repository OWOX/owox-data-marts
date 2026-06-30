import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

  @ApiPropertyOptional({
    example: false,
    description:
      'True when a Drive folder was configured but the document was created in the Drive root ' +
      'instead (the connected OAuth token lacks a Drive scope). The user should reconnect the ' +
      'Google account to honor the chosen folder.',
  })
  placedInRoot?: boolean;

  @ApiPropertyOptional({
    example: true,
    description:
      'Whether the document was shared with the requesting user. False when sharing was skipped ' +
      '(token lacks a Drive scope, or the requester email could not be resolved) or failed.',
  })
  sharedWithRequester?: boolean;
}
