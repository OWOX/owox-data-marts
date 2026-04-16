import { applyDecorators } from '@nestjs/common';
import {
  ApiBody,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { CreateDataStorageApiDto } from '../../dto/presentation/create-data-storage-api.dto';
import { DataStorageAccessValidationResponseApiDto } from '../../dto/presentation/data-storage-access-validation-response-api.dto';
import { DataStorageListResponseApiDto } from '../../dto/presentation/data-storage-list-response-api.dto';
import { DataStorageResponseApiDto } from '../../dto/presentation/data-storage-response-api.dto';
import { DataStorageByTypeResponseApiDto } from '../../dto/presentation/data-storage-by-type-response-api.dto';
import { UpdateDataStorageApiDto } from '../../dto/presentation/update-data-storage-api.dto';
import { UpdateStorageAvailabilityApiDto } from '../../dto/presentation/update-availability-api.dto';
import { GenerateAuthorizationUrlRequestDto } from '../../dto/presentation/google-oauth/generate-authorization-url-request.dto';
import { GenerateAuthorizationUrlResponseDto } from '../../dto/presentation/google-oauth/generate-authorization-url-response.dto';
import { ExchangeAuthorizationCodeRequestDto } from '../../dto/presentation/google-oauth/exchange-authorization-code-request.dto';
import { ExchangeAuthorizationCodeResponseDto } from '../../dto/presentation/google-oauth/exchange-authorization-code-response.dto';
import { GoogleOAuthStatusResponseDto } from '../../dto/presentation/google-oauth/google-oauth-status-response.dto';
import { GoogleOAuthSettingsResponseDto } from '../../dto/presentation/google-oauth/oauth-settings-response.dto';
import { DataStorageType } from '../../data-storage-types/enums/data-storage-type.enum';
import { OwnerFilter } from '../../enums/owner-filter.enum';

export function ListDataStoragesByTypeSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'List Data Storages by type (for credential copy)' }),
    ApiParam({ name: 'type', description: 'Data Storage type', enum: DataStorageType }),
    ApiOkResponse({ type: [DataStorageByTypeResponseApiDto] })
  );
}

export function CreateDataStorageSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Create a new Data Storage' }),
    ApiBody({ type: CreateDataStorageApiDto }),
    ApiResponse({ status: 201, type: DataStorageResponseApiDto })
  );
}

export function UpdateDataStorageSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Update Data Storage by ID' }),
    ApiParam({ name: 'id', description: 'Data Storage ID' }),
    ApiBody({ type: UpdateDataStorageApiDto }),
    ApiOkResponse({ type: DataStorageResponseApiDto })
  );
}

export function GetDataStorageSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get a Data Storage by ID' }),
    ApiParam({ name: 'id', description: 'Data Storage ID' }),
    ApiOkResponse({ type: DataStorageResponseApiDto })
  );
}

export function ListDataStoragesSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get all Data Storages' }),
    ApiQuery({
      name: 'ownerFilter',
      required: false,
      enum: OwnerFilter,
      example: OwnerFilter.HAS_OWNERS,
      description: 'Filter Data Storages by whether they have owners',
    }),
    ApiOkResponse({ type: [DataStorageListResponseApiDto] })
  );
}

export function DeleteDataStorageSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Delete Data Storage by ID' }),
    ApiParam({ name: 'id', description: 'Data Storage ID' }),
    ApiOkResponse({ description: 'Data Storage successfully deleted' })
  );
}

export function ValidateDataStorageAccessSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Validate Data Storage access' }),
    ApiParam({ name: 'id', type: String }),
    ApiOkResponse({ type: DataStorageAccessValidationResponseApiDto })
  );
}

export function OAuthSettingsSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get Google OAuth settings (client ID, redirect URI, scopes)' }),
    ApiOkResponse({ type: GoogleOAuthSettingsResponseDto, description: 'OAuth settings' })
  );
}

export function OAuthAuthorizeSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Generate Google OAuth authorization URL for a Data Storage' }),
    ApiParam({ name: 'id', description: 'Data Storage ID' }),
    ApiBody({ type: GenerateAuthorizationUrlRequestDto }),
    ApiOkResponse({
      type: GenerateAuthorizationUrlResponseDto,
      description: 'Authorization URL and state token',
    }),
    ApiResponse({ status: 400, description: 'Invalid redirect URI' }),
    ApiResponse({ status: 503, description: 'Google OAuth is not configured' })
  );
}

export function OAuthExchangeSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Exchange OAuth authorization code for tokens (Data Storage)' }),
    ApiBody({ type: ExchangeAuthorizationCodeRequestDto }),
    ApiOkResponse({
      type: ExchangeAuthorizationCodeResponseDto,
      description: 'OAuth credential created successfully',
    }),
    ApiResponse({ status: 400, description: 'Invalid authorization code or state' }),
    ApiResponse({ status: 403, description: 'OAuth state does not belong to your project' }),
    ApiResponse({ status: 503, description: 'Google OAuth is not configured' })
  );
}

export function OAuthStatusSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get OAuth status for a Data Storage' }),
    ApiParam({ name: 'id', description: 'Data Storage ID' }),
    ApiOkResponse({ type: GoogleOAuthStatusResponseDto, description: 'OAuth connection status' })
  );
}

export function OAuthRevokeSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Revoke Google OAuth credentials for a Data Storage' }),
    ApiParam({ name: 'id', description: 'Data Storage ID' }),
    ApiNoContentResponse({ description: 'OAuth credentials revoked' })
  );
}

export function UpdateStorageAvailabilitySpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Update Data Storage availability' }),
    ApiParam({ name: 'id', description: 'Data Storage ID' }),
    ApiBody({ type: UpdateStorageAvailabilityApiDto }),
    ApiNoContentResponse({ description: 'Data Storage availability updated' })
  );
}
