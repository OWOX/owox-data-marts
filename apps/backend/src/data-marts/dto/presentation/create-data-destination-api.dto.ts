import { ApiProperty } from '@nestjs/swagger';
import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
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
    description:
      'Credentials required for the selected destination type (optional when sourceDestinationId is provided)',
  })
  @IsObject()
  @IsOptional()
  credentials?: DataDestinationCredentials;

  @ApiProperty({ required: false, description: 'Pre-created OAuth credential ID' })
  @IsUUID()
  @IsOptional()
  credentialId?: string;

  @ApiProperty({
    required: false,
    description:
      'Source Destination ID to copy credentials from (mutually exclusive with credentials)',
  })
  @IsUUID()
  @IsOptional()
  sourceDestinationId?: string;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  ownerIds?: string[];
}
