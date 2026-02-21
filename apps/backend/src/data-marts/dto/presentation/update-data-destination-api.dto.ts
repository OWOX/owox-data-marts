import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsString, IsOptional, IsUUID } from 'class-validator';
import { DataDestinationCredentials } from '../../data-destination-types/data-destination-credentials.type';

export class UpdateDataDestinationApiDto {
  @ApiProperty({ example: 'My Updated Google Sheets Destination' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Credentials required for the selected destination type',
  })
  @IsObject()
  @IsOptional()
  credentials: DataDestinationCredentials;

  @ApiProperty({
    example: 'abc123e4-5678-90ab-cdef-1234567890ab',
    nullable: true,
    required: false,
    description: 'Credential ID for OAuth-based authentication (null to disconnect)',
  })
  @IsUUID()
  @IsOptional()
  credentialId?: string | null;
}
