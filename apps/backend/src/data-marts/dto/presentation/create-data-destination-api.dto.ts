import { ApiProperty } from '@nestjs/swagger';
import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';
import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';
import { DataDestinationCredentials } from '../../data-destination-types/data-destination-credentials.type';

export class CreateDataDestinationApiDto {
  @ApiProperty({ example: 'My Google Sheets Destination' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ enum: DataDestinationType })
  @IsEnum(DataDestinationType)
  type: DataDestinationType;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Credentials required for the selected destination type',
  })
  @IsObject()
  credentials: DataDestinationCredentials;

  @ApiProperty({ required: false, description: 'Pre-created OAuth credential ID' })
  @IsUUID()
  @IsOptional()
  credentialId?: string;
}
