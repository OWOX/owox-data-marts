import { ApiProperty } from '@nestjs/swagger';
import { StorageCredentialSummaryApiDto } from './storage-credential-summary-api.dto';

/** The Credential one connector configuration is bound to, as the member sees it. */
export class DataMartSourceCredentialApiDto {
  @ApiProperty({ description: 'The `_id` of the configuration item' })
  configId: string;

  @ApiProperty({ type: StorageCredentialSummaryApiDto })
  summary: StorageCredentialSummaryApiDto;
}
