import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsNotEmpty,
  IsObject,
  IsString,
  IsOptional,
  IsUUID,
  IsArray,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DataDestinationCredentials } from '../../data-destination-types/data-destination-credentials.type';
import { DestinationConfigDto } from './destination-config.dto';

export class UpdateDataDestinationApiDto {
  @ApiProperty({ example: 'My Updated Google Sheets Destination' })
  @IsString()
  @IsNotEmpty()
  title: string;

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
      'Credential for a Google Sheets Destination, or a Google Chat Destination that delivers by webhook. Absent keeps the current one; null is rejected. Needs USE on the Credential and EDIT on the Destination.',
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

  @ApiProperty({
    required: false,
    description: 'Whether this destination is available for use by project members',
  })
  @IsOptional()
  @IsBoolean()
  availableForUse?: boolean;

  @ApiProperty({
    required: false,
    description: 'Whether this destination is available for maintenance by project members',
  })
  @IsOptional()
  @IsBoolean()
  availableForMaintenance?: boolean;

  @ApiProperty({
    type: [String],
    required: false,
    description: 'Context IDs attached to this destination (full replacement)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  contextIds?: string[];

  @ApiPropertyOptional({
    type: DestinationConfigDto,
    description: 'Optional destination-level config (e.g. Google Drive folder for Google Sheets)',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DestinationConfigDto)
  config?: DestinationConfigDto;
}
