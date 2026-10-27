import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';

export class CreateConnectGoogleSheetsDestinationApiDto {
  @ApiProperty({ example: 'Google Sheets (user@example.com)' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description:
      'Credential the Destination uses: one that fits Google Sheets and the member can USE',
  })
  // An older page sends credentialId instead and is told to reload.
  @ValidateIf((dto: CreateConnectGoogleSheetsDestinationApiDto) => dto.credentialId === undefined)
  @IsString()
  @IsNotEmpty()
  reusableCredentialId: string;

  @ApiProperty({
    type: 'string',
    required: false,
    deprecated: true,
    description: 'Rejected: "This page is out of date. Reload it."',
  })
  @IsUUID()
  @IsOptional()
  credentialId?: string;
}
