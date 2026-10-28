import { ApiProperty } from '@nestjs/swagger';
import { DataStorageConfig } from '../../data-storage-types/data-storage-config.type';
import { DataStorageType } from '../../data-storage-types/enums/data-storage-type.enum';
import { UserProjectionDto } from '../../../idp/dto/domain/user-projection.dto';
import { ContextSummary } from '../../utils/extract-context-summaries';
import { ContextSummaryApiDto } from './context-summary-api.dto';
import { StorageCredentialSummaryApiDto } from './storage-credential-summary-api.dto';

export class DataStorageResponseApiDto {
  @ApiProperty({ example: 'abc123e4-5678-90ab-cdef-1234567890ab' })
  id: string;

  @ApiProperty({ example: 'title' })
  title: string;

  @ApiProperty({ enum: DataStorageType, example: DataStorageType.GOOGLE_BIGQUERY })
  type: DataStorageType;

  @ApiProperty({ example: 'my-project' })
  projectId: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
  })
  config: DataStorageConfig | undefined;

  @ApiProperty({ example: '2024-01-01T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-02T15:30:00.000Z' })
  modifiedAt: Date;

  @ApiProperty({
    type: StorageCredentialSummaryApiDto,
    nullable: true,
    required: false,
    description:
      'The Credential the Storage uses, as the member sees it; pending while the Storage runs on its own key; null when it has neither. Absent where a Storage is embedded in another resource.',
  })
  reusableCredential?: StorageCredentialSummaryApiDto | null;

  @ApiProperty({ type: UserProjectionDto, required: false, nullable: true })
  createdByUser?: UserProjectionDto | null;

  @ApiProperty({ type: [UserProjectionDto] })
  ownerUsers: UserProjectionDto[];

  @ApiProperty({ example: true })
  availableForUse?: boolean;

  @ApiProperty({ example: true })
  availableForMaintenance?: boolean;

  @ApiProperty({ type: [ContextSummaryApiDto] })
  contexts: ContextSummary[];
}
