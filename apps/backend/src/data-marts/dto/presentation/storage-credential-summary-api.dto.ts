import { ApiProperty } from '@nestjs/swagger';
import type { StorageCredentialState } from '../../data-storage-types/storage-credential-state';

const STATES: StorageCredentialState[] = [
  'ready',
  'disabled',
  'not-configured',
  'reconnect-required',
  'reauthorize-required',
];

/** A restricted or pending summary carries only `access` and `state`. */
export class StorageCredentialSummaryApiDto {
  @ApiProperty({
    enum: ['visible', 'restricted', 'pending'],
    description:
      'pending: the Storage has no Credential yet and runs on its own key until a Credential is selected',
  })
  access: 'visible' | 'restricted' | 'pending';

  @ApiProperty({ required: false })
  id?: string;

  @ApiProperty({ required: false })
  title?: string;

  @ApiProperty({ required: false, example: 'google-service-account' })
  definitionId?: string;

  @ApiProperty({ required: false, example: 'Google service account' })
  providerName?: string;

  @ApiProperty({ type: 'string', required: false, nullable: true })
  identity?: string | null;

  @ApiProperty({ enum: STATES })
  state: StorageCredentialState;
}
