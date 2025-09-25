import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsString, IsOptional } from 'class-validator';
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
}
