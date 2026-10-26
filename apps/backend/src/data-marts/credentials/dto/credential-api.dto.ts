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
import {
  CredentialCategorySchema,
  CredentialIconSchema,
  type CredentialCategory,
  type CredentialIcon,
  CredentialFieldDefinition,
  CredentialAiModelMappings,
  CredentialAiModelMappingModes,
  CredentialDefinitionContract,
  CredentialDefinitionSource,
  CredentialPublicMetadata,
  CredentialValidationState,
} from '../credential.types';
import type { UserProjectionDto } from '../../../idp/dto/domain/user-projection.dto';
import { DataStorageType } from '../../data-storage-types/enums/data-storage-type.enum';
import type { ContextSummary } from '../../utils/extract-context-summaries';
import { ContextSummaryApiDto } from '../../dto/presentation/context-summary-api.dto';
import { ExchangeAuthorizationCodeRequestDto } from '../../dto/presentation/google-oauth/exchange-authorization-code-request.dto';
import { GenerateAuthorizationUrlRequestDto } from '../../dto/presentation/google-oauth/generate-authorization-url-request.dto';

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

  @ApiPropertyOptional({
    type: CredentialSecretApiDto,
    description: 'Required for every definition except fields auth.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CredentialSecretApiDto)
  secret?: CredentialSecretApiDto;

  @ApiPropertyOptional({
    description:
      'Values for a definition with fields auth, by field key. Secret fields are write-only and never returned.',
    type: 'object',
    additionalProperties: { type: 'string', nullable: true },
  })
  @IsOptional()
  @IsObject()
  fields?: Record<string, string | null>;

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

  @ApiPropertyOptional({
    description:
      'Values for a definition with fields auth, by field key. An omitted field keeps its value; null clears an optional one. Secret fields are write-only and never returned.',
    type: 'object',
    additionalProperties: { type: 'string', nullable: true },
  })
  @IsOptional()
  @IsObject()
  fields?: Record<string, string | null>;

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

export class GoogleOAuthCredentialSettingsApiDto {
  @ApiProperty({ description: 'Whether this deployment can connect Google accounts.' })
  available: boolean;
}

export class AuthorizeGoogleOAuthCredentialApiDto extends GenerateAuthorizationUrlRequestDto {
  @ApiPropertyOptional({ description: 'Reconnects this Credential instead of creating one.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  credentialId?: string;

  @ApiPropertyOptional({
    default: 'google-oauth',
    description: 'The Google account definition of the Credential to create.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  definitionId?: string;
}

export class GoogleOAuthCredentialAuthorizationApiDto {
  @ApiProperty() authorizationUrl: string;
}

export class ConnectGoogleOAuthCredentialApiDto extends ExchangeAuthorizationCodeRequestDto {
  @ApiPropertyOptional({
    description: 'Used when the Credential is created. Defaults to the account email.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ type: [String], description: 'Used when the Credential is created.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  ownerIds?: string[];

  @ApiPropertyOptional({ default: true, description: 'Used when the Credential is created.' })
  @IsOptional()
  @IsBoolean()
  availableForUse?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Used when the Credential is created.' })
  @IsOptional()
  @IsBoolean()
  availableForMaintenance?: boolean;
}

export type CredentialDefinitionAuthApiDto =
  | { type: 'header' | 'google-service-account' }
  | { type: 'fields'; fields: CredentialFieldDefinition[] }
  | { type: 'oauth'; provider: 'google'; label: string };

export class CredentialDefinitionApiDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ['builtin', 'external'] })
  source: CredentialDefinitionSource;
  @ApiProperty() displayName: string;
  @ApiProperty() description: string;
  @ApiPropertyOptional({ nullable: true, format: 'uri' })
  documentationUrl: string | null;
  @ApiProperty() secretLabel: string;
  @ApiProperty({ enum: CredentialCategorySchema.options })
  category: CredentialCategory;
  @ApiProperty({
    enum: CredentialIconSchema.options,
    nullable: true,
  })
  icon: CredentialIcon | null;
  /** The Storage types this definition fits; empty for a definition no Storage takes. */
  @ApiProperty({ enum: DataStorageType, isArray: true })
  storageTypes: DataStorageType[];
  @ApiProperty({
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['header', 'google-service-account', 'fields', 'oauth'],
      },
      fields: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string' },
            label: { type: 'string' },
            input: { type: 'string', enum: ['text', 'password', 'multiline'] },
            secret: { type: 'boolean' },
            required: { type: 'boolean' },
            identity: { type: 'boolean' },
          },
        },
      },
      provider: { type: 'string', enum: ['google'] },
      label: { type: 'string' },
    },
  })
  auth: CredentialDefinitionAuthApiDto;
  @ApiProperty({ type: [String] }) origins: string[];
  @ApiProperty() supportsAi: boolean;
  @ApiPropertyOptional({ type: 'object', nullable: true, additionalProperties: true })
  ai: CredentialDefinitionContract['ai'] | null;
  @ApiPropertyOptional({ nullable: true }) compatibilityLine: string | null;
}

export interface CredentialConsumerReferenceApiDto {
  consumerType: string;
  consumerId: string;
  /** The consumer's title when the member can see it, otherwise null. */
  title: string | null;
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
  @ApiPropertyOptional({
    description:
      'Non-secret facts of the stored secret: a Google service account key, the non-secret fields of a field set, or a connected Google account.',
    nullable: true,
    oneOf: [
      {
        type: 'object',
        properties: {
          clientEmail: { type: 'string' },
          projectId: { type: 'string' },
          privateKeyId: { type: 'string' },
        },
      },
      {
        type: 'object',
        properties: { fields: { type: 'object', additionalProperties: { type: 'string' } } },
      },
      {
        type: 'object',
        properties: {
          account: {
            type: 'object',
            properties: {
              email: { type: 'string' },
              name: { type: 'string', nullable: true },
              picture: { type: 'string', nullable: true },
            },
          },
          scopes: { type: 'array', items: { type: 'string' } },
        },
      },
    ],
  })
  publicMetadata: CredentialPublicMetadata | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'The account the Credential belongs to; null when the definition names none.',
  })
  identity: string | null;
  @ApiProperty({
    type: [String],
    description:
      'Keys of the secret fields of a field set that hold a value; the values are never returned.',
  })
  setSecretFieldKeys: string[];
  @ApiProperty({ description: 'Whether the current member may bind this Credential.' })
  canUse: boolean;
  @ApiProperty({ type: [Object] }) ownerUsers: UserProjectionDto[];
  @ApiProperty({ type: [ContextSummaryApiDto] }) contexts: ContextSummary[];
  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        consumerType: { type: 'string' },
        consumerId: { type: 'string' },
        title: {
          type: 'string',
          nullable: true,
          description: 'Null when the member cannot see the consumer.',
        },
        requirementKey: { type: 'string' },
        lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
      },
    },
  })
  usedBy: CredentialConsumerReferenceApiDto[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() modifiedAt: Date;
}

export interface ResolvedCredentialDefinition {
  readonly definitionId: string;
  readonly source: CredentialDefinitionSource;
  readonly compatibilityLine: string | null;
  readonly contract: CredentialDefinitionContract;
}
