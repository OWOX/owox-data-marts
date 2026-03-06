import { ApiProperty } from '@nestjs/swagger';
import type { CredentialIdentity } from '../../entities/credential-identity.type';

export class DataStorageByTypeResponseApiDto {
  @ApiProperty({ description: 'Data Storage ID', type: 'string' })
  id: string;

  @ApiProperty({ description: 'Data Storage title', type: 'string' })
  title: string;

  @ApiProperty({
    description: 'Name of the Data Mart that uses this storage (null if none)',
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
