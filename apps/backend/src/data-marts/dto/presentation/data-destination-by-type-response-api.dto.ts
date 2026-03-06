import { ApiProperty } from '@nestjs/swagger';
import type { CredentialIdentity } from '../../entities/credential-identity.type';

export class DataDestinationByTypeResponseApiDto {
  @ApiProperty({ description: 'Data Destination ID', type: 'string' })
  id: string;

  @ApiProperty({ description: 'Data Destination title', type: 'string' })
  title: string;

  @ApiProperty({
    description: 'Name of the Data Mart that uses this destination (null if none)',
    type: 'string',
    nullable: true,
  })
  dataMartName: string | null;

  @ApiProperty({
    description: 'Credential identity (display info, no secrets)',
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  identity: CredentialIdentity | null;
}
