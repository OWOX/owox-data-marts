import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * Destination-level configuration accepted on create/update.
 * Optional and type-specific (currently only Google Sheets uses `folderId`).
 */
export class DestinationConfigDto {
  @ApiPropertyOptional({
    nullable: true,
    description:
      'Google Drive folder ID for auto-created Google Sheets (Google Sheets destinations). Pass null to clear.',
  })
  @IsOptional()
  @IsString()
  folderId?: string | null;
}
