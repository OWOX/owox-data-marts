import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * Request to auto-create a new Google Sheet for a Data Destination.
 */
export class CreateGoogleSheetDocumentRequestDto {
  @ApiPropertyOptional({
    example: 'Revenue by channel',
    description: 'Title for the new Google Sheet. Falls back to a default when omitted.',
  })
  @IsOptional()
  @IsString()
  title?: string;
}
