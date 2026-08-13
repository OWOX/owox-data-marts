import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Google's own limit for a sheet (tab) name. */
const MAX_SHEET_TITLE_LENGTH = 100;

/**
 * Request to point a Google Sheets report at a sheet with the given title,
 * creating that sheet when the spreadsheet does not already have one.
 */
export class ReconnectGoogleSheetRequestDto {
  @ApiPropertyOptional({
    example: 'Revenue by channel',
    description:
      'Title of the sheet (tab) to reconnect to. An existing sheet with this title is reused; ' +
      'otherwise it is created. Falls back to the report title when omitted.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SHEET_TITLE_LENGTH)
  title?: string;
}
