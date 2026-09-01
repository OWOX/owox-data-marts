import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type {
  CredentialAiModelMappings,
  CredentialAiModelMappingModes,
  CredentialDefinitionContract,
  CredentialDefinitionSource,
  CredentialValidationState,
} from '../credential.types';
import type { UserProjectionDto } from '../../../idp/dto/domain/user-projection.dto';
import type { ContextSummary } from '../../utils/extract-context-summaries';

export class CredentialSecretApiDto {
  @ApiProperty({
    description: 'Opaque provider secret. Write-only and never returned.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32_768)
  value: string;
}

export class CreateCredentialApiDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({ description: 'Built-in id or stable external definition id.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  definitionId: string;

  @ApiProperty({ type: CredentialSecretApiDto })
  @ValidateNested()
  @Type(() => CredentialSecretApiDto)
  secret: CredentialSecretApiDto;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  ownerIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  contextIds?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  availableForUse?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  availableForMaintenance?: boolean;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsOptional()
  @IsObject()
  aiModelMappings?: CredentialAiModelMappings;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { enum: ['recommended', 'override'] },
  })
  @IsOptional()
  @IsObject()
  aiModelMappingModes?: CredentialAiModelMappingModes;
}

export class UpdateCredentialApiDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ type: CredentialSecretApiDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CredentialSecretApiDto)
  secret?: CredentialSecretApiDto;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  ownerIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  contextIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  availableForUse?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  availableForMaintenance?: boolean;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
    nullable: true,
  })
  @IsOptional()
  @IsObject()
  aiModelMappings?: CredentialAiModelMappings | null;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { enum: ['recommended', 'override'] },
    nullable: true,
  })
  @IsOptional()
  @IsObject()
  aiModelMappingModes?: CredentialAiModelMappingModes | null;
}

export class CredentialDefinitionApiDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ['builtin', 'external'] })
  source: CredentialDefinitionSource;
  @ApiProperty() displayName: string;
  @ApiProperty() description: string;
  @ApiPropertyOptional({ nullable: true, format: 'uri' })
  documentationUrl: string | null;
  @ApiProperty() secretLabel: string;
  @ApiProperty({ type: [String] }) origins: string[];
  @ApiProperty() supportsAi: boolean;
  @ApiPropertyOptional({ type: 'object', nullable: true, additionalProperties: true })
  ai: CredentialDefinitionContract['ai'] | null;
  @ApiPropertyOptional({ nullable: true }) compatibilityLine: string | null;
}

export interface CredentialConsumerReferenceApiDto {
  consumerType: string;
  consumerId: string;
  requirementKey: string;
  lastUsedAt: Date | null;
}

export class CredentialResponseApiDto {
  @ApiProperty() id: string;
  @ApiProperty() projectId: string;
  @ApiProperty() title: string;
  @ApiProperty({ type: CredentialDefinitionApiDto })
  definition: CredentialDefinitionApiDto;
  @ApiProperty() secretConfigured: true;
  @ApiProperty() definitionConsentRequired: boolean;
  @ApiProperty() enabled: boolean;
  @ApiProperty() availableForUse: boolean;
  @ApiProperty() availableForMaintenance: boolean;
  @ApiProperty({ enum: ['unknown', 'verified', 'rejected'] })
  validationState: CredentialValidationState;
  @ApiPropertyOptional({ nullable: true }) validationMessage: string | null;
  @ApiPropertyOptional({ nullable: true }) validatedAt: Date | null;
  @ApiPropertyOptional({ nullable: true }) lastUsedAt: Date | null;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
    nullable: true,
  })
  aiModelMappings: CredentialAiModelMappings | null;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { enum: ['recommended', 'override'] },
    nullable: true,
  })
  aiModelMappingModes: CredentialAiModelMappingModes | null;
  @ApiProperty({ type: [Object] }) ownerUsers: UserProjectionDto[];
  @ApiProperty({ type: [Object] }) contexts: ContextSummary[];
  @ApiProperty({ type: [Object] }) usedBy: CredentialConsumerReferenceApiDto[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() modifiedAt: Date;
}

export interface ResolvedCredentialDefinition {
  readonly definitionId: string;
  readonly source: CredentialDefinitionSource;
  readonly compatibilityLine: string | null;
  readonly contract: CredentialDefinitionContract;
}
