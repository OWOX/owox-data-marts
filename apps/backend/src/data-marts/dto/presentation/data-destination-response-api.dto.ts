import { ApiProperty } from '@nestjs/swagger';
import { DataDestinationCredentials } from '../../data-destination-types/data-destination-credentials.type';
import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';

export type DataDestinationCredentialsPublic = {
  type: 'google-sheets-credentials';
  serviceAccountKey: {
    type: 'service_account';
    project_id: string;
    client_email: string;
    client_id: string;
  };
};

export type GoogleSheetsOAuthCredentialsPublic = {
  type: 'google-sheets-oauth-credentials';
};

export class DataDestinationResponseApiDto {
  @ApiProperty({ example: 'abc123e4-5678-90ab-cdef-1234567890ab' })
  id: string;

  @ApiProperty({ example: 'My Google Sheets Destination' })
  title: string;

  @ApiProperty({ enum: DataDestinationType, example: DataDestinationType.GOOGLE_SHEETS })
  type: DataDestinationType;

  @ApiProperty({ example: 'my-project' })
  projectId: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Credentials without sensitive fields',
  })
  credentials:
    | DataDestinationCredentials
    | DataDestinationCredentialsPublic
    | GoogleSheetsOAuthCredentialsPublic;

  @ApiProperty({ example: '2024-01-01T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-02T15:30:00.000Z' })
  modifiedAt: Date;

  @ApiProperty({ example: 'abc123e4-5678-90ab-cdef-1234567890ab', nullable: true, required: false })
  credentialId?: string | null;
}
