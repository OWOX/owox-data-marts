import { ApiProperty } from '@nestjs/swagger';
import type { DestinationCredentialState } from '../../data-destination-types/destination-credential-state';

const STATES: DestinationCredentialState[] = [
  'ready',
  'disabled',
  'not-configured',
  'reconnect-required',
  'reauthorize-required',
];

/** A restricted or pending summary carries only `access`, `state` and, for Google Sheets, `identity` and `definitionId`. */
export class DestinationCredentialSummaryApiDto {
  @ApiProperty({
    enum: ['visible', 'restricted', 'pending'],
    description:
      'pending: the Destination has no Credential yet and runs on its own key until a Credential is selected',
  })
  access: 'visible' | 'restricted' | 'pending';

  @ApiProperty({ required: false })
  id?: string;

  @ApiProperty({ required: false })
  title?: string;

  @ApiProperty({ required: false, example: 'google-service-account' })
  definitionId?: string;

  @ApiProperty({ required: false, example: 'Google Service Account' })
  providerName?: string;

  @ApiProperty({
    type: 'string',
    required: false,
    nullable: true,
    description:
      'The service account or Google account email to share a sheet with; a restricted or pending Google Sheets summary carries it too',
  })
  identity?: string | null;

  @ApiProperty({ enum: STATES })
  state: DestinationCredentialState;
}
