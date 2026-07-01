import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * Destination-level configuration accepted on create/update.
 * Optional and type-specific (currently only Google Sheets uses the Drive folder).
 *
 * Only `folderUrl` is client-supplied; the canonical `folderId` is derived from
 * it server-side (see DataDestinationMapper.normalizeDestinationConfig). The
 * folderId is intentionally NOT accepted from the client so it cannot bypass the
 * Drive-folder-URL validation.
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
}
