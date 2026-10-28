import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { DestinationPublicCredentials } from '../../data-destination-types/destination-public-credentials';
import { DataDestinationCredentials } from '../../data-destination-types/data-destination-credentials.type';
import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';
import { UserProjectionDto } from '../../../idp/dto/domain/user-projection.dto';
import { ContextSummary } from '../../utils/extract-context-summaries';
import { ContextSummaryApiDto } from './context-summary-api.dto';
import { DestinationConfig } from '../../entities/destination-config.type';
import { DestinationCredentialSummaryApiDto } from './destination-credential-summary-api.dto';

export type {
  GoogleChatCredentialsPublic,
  GoogleSheetsOAuthCredentialsPublic,
  GoogleSheetsServiceAccountCredentialsPublic,
} from '../../data-destination-types/destination-public-credentials';

/** The key of a Destination as clients read it, never a secret; empty for a plugin or a missing key. */
export type DestinationResponseCredentials =
  | Extract<
      DataDestinationCredentials,
      { type: 'email-credentials' } | { type: 'looker-studio-credentials' }
    >
  | DestinationPublicCredentials
  | Record<string, never>;

export class DataDestinationResponseApiDto {
  @ApiProperty({ example: 'abc123e4-5678-90ab-cdef-1234567890ab' })
  id!: string;

  @ApiProperty({ example: 'My Google Sheets Destination' })
  title!: string;

  @ApiProperty({ enum: DataDestinationType, example: DataDestinationType.GOOGLE_SHEETS })
  type!: DataDestinationType;

  @ApiProperty({ example: 'my-project' })
  projectId!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Credentials without sensitive fields; empty for a plugin or when the Destination has no key. Google Sheets and Google Chat webhook Destinations show only the account or that a webhook is configured.',
  })
  credentials!: DestinationResponseCredentials;

  @ApiProperty({ example: '2024-01-01T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2024-01-02T15:30:00.000Z' })
  modifiedAt!: Date;

  @ApiProperty({
    example: 'abc123e4-5678-90ab-cdef-1234567890ab',
    nullable: true,
    required: false,
    description:
      'The id of the credentials above. Absent for Google Sheets and Google Chat webhook delivery.',
  })
  credentialId?: string | null;

  @ApiProperty({
    type: DestinationCredentialSummaryApiDto,
    nullable: true,
    required: false,
    description:
      'The Credential a Google Sheets or Google Chat webhook Destination uses, as the member sees it; pending while it runs on its own key; null when it has neither. Absent for other types, Google Chat email delivery and plugins.',
  })
  reusableCredential?: DestinationCredentialSummaryApiDto | null;

  @ApiProperty({ type: UserProjectionDto, required: false, nullable: true })
  createdByUser?: UserProjectionDto | null;

  @ApiProperty({ type: [UserProjectionDto] })
  ownerUsers!: UserProjectionDto[];

  @ApiProperty({ example: true })
  availableForUse?: boolean;

  @ApiProperty({ example: true })
  availableForMaintenance?: boolean;

  @ApiProperty({ type: [ContextSummaryApiDto] })
  contexts!: ContextSummary[];

  @ApiPropertyOptional({
    type: 'object',
    nullable: true,
    additionalProperties: true,
    description: 'Optional destination-level config (e.g. Google Drive folder for Google Sheets)',
  })
  config?: DestinationConfig | null;
}
