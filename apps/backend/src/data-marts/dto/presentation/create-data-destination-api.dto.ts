import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DataDestinationCredentials } from '../../data-destination-types/data-destination-credentials.type';
import { DestinationConfigDto } from './destination-config.dto';

export class CreateDataDestinationApiDto {
  @ApiProperty({ example: 'My Google Sheets Destination' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ enum: DataDestinationType })
  @IsEnum(DataDestinationType)
  type: DataDestinationType;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description:
      'Credentials for Data Studio, Email, Slack and Microsoft Teams, and the email recipients of a Google Chat Destination. Google Sheets and Google Chat webhook delivery select a Credential with reusableCredentialId instead.',
  })
  @IsObject()
  @IsOptional()
  credentials?: DataDestinationCredentials;

  @ApiProperty({
    type: 'string',
    required: false,
    description:
      'Credential for a Google Sheets Destination, or a Google Chat Destination that delivers by webhook. Required for Google Sheets; Google Chat needs it or email credentials; null is rejected. Needs USE on the Credential.',
  })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  reusableCredentialId?: string | null;

  // Legacy: rejected old credential field; an older page still sends it.
  @ApiProperty({
    type: 'string',
    nullable: true,
    required: false,
    deprecated: true,
    description: 'Rejected: "This page is out of date. Reload it."',
  })
  @IsUUID()
  @IsOptional()
  credentialId?: string | null;

  // Legacy: rejected old credential field; an older page still sends it.
  @ApiProperty({
    type: 'string',
    required: false,
    deprecated: true,
    description: 'Rejected: "This page is out of date. Reload it."',
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

  @ApiPropertyOptional({
    type: DestinationConfigDto,
    description: 'Optional destination-level config (e.g. Google Drive folder for Google Sheets)',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DestinationConfigDto)
  config?: DestinationConfigDto;
}
