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
      'Google Drive folder URL for auto-created Google Sheets (Google Sheets destinations). The folder ID is derived from it server-side. Pass null/empty to clear.',
  })
  @IsOptional()
  @IsString()
  folderUrl?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Derived Google Drive folder ID (server-managed; clients should send folderUrl). Pass null to clear.',
  })
  @IsOptional()
  @IsString()
  folderId?: string | null;
}
