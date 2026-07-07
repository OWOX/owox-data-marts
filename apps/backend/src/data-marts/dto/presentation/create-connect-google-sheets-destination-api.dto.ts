import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateConnectGoogleSheetsDestinationApiDto {
  @ApiProperty({ example: 'Google Sheets (user@example.com)' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'Pre-created Google OAuth credential ID from the connect flow' })
  @IsUUID()
  credentialId: string;
}
