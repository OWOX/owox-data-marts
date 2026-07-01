import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiBody,
  ApiParam,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiNoContentResponse,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { CreateDataDestinationApiDto } from '../../dto/presentation/create-data-destination-api.dto';
import { UpdateDataDestinationApiDto } from '../../dto/presentation/update-data-destination-api.dto';
import { UpdateDestinationAvailabilityApiDto } from '../../dto/presentation/update-availability-api.dto';
import { DataDestinationResponseApiDto } from '../../dto/presentation/data-destination-response-api.dto';
import { DataDestinationImpactResponseApiDto } from '../../dto/presentation/data-destination-impact-response-api.dto';
import { DataDestinationByTypeResponseApiDto } from '../../dto/presentation/data-destination-by-type-response-api.dto';
import { GenerateAuthorizationUrlRequestDto } from '../../dto/presentation/google-oauth/generate-authorization-url-request.dto';
import { GenerateAuthorizationUrlResponseDto } from '../../dto/presentation/google-oauth/generate-authorization-url-response.dto';
import { ExchangeAuthorizationCodeRequestDto } from '../../dto/presentation/google-oauth/exchange-authorization-code-request.dto';
import { ExchangeAuthorizationCodeResponseDto } from '../../dto/presentation/google-oauth/exchange-authorization-code-response.dto';
import { FinishMcpGoogleSheetsSetupRequestDto } from '../../dto/presentation/google-oauth/finish-mcp-google-sheets-setup-request.dto';
import { FinishMcpGoogleSheetsSetupResponseDto } from '../../dto/presentation/google-oauth/finish-mcp-google-sheets-setup-response.dto';
import { GoogleOAuthStatusResponseDto } from '../../dto/presentation/google-oauth/google-oauth-status-response.dto';
import { GoogleOAuthSettingsResponseDto } from '../../dto/presentation/google-oauth/oauth-settings-response.dto';
import { CreateGoogleSheetDocumentRequestDto } from '../../dto/presentation/google-sheets/create-google-sheet-document-request.dto';
import { CreateGoogleSheetDocumentResponseDto } from '../../dto/presentation/google-sheets/create-google-sheet-document-response.dto';
import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';
import { OwnerFilter } from '../../enums/owner-filter.enum';

export function ListDataDestinationsByTypeSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'List Data Destinations by type (for credential copy)' }),
    ApiParam({ name: 'type', description: 'Data Destination type', enum: DataDestinationType }),
    ApiOkResponse({ type: [DataDestinationByTypeResponseApiDto] })
  );
}

export function CreateDataDestinationSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Create a new Data Destination' }),
    ApiBody({ type: CreateDataDestinationApiDto }),
    ApiCreatedResponse({ type: DataDestinationResponseApiDto })
  );
}

export function UpdateDataDestinationSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Update Data Destination by ID' }),
    ApiParam({ name: 'id', description: 'Data Destination ID' }),
    ApiBody({ type: UpdateDataDestinationApiDto }),
    ApiOkResponse({ type: DataDestinationResponseApiDto })
  );
}

export function GetDataDestinationSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get a Data Destination by ID' }),
    ApiParam({ name: 'id', description: 'Data Destination ID' }),
    ApiOkResponse({ type: DataDestinationResponseApiDto })
  );
}

export function ListDataDestinationsSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get all Data Destinations' }),
    ApiQuery({
      name: 'ownerFilter',
      required: false,
      enum: OwnerFilter,
      example: OwnerFilter.HAS_OWNERS,
      description: 'Filter Data Destinations by whether they have owners',
    }),
    ApiOkResponse({ type: [DataDestinationResponseApiDto] })
  );
}

export function DeleteDataDestinationSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Delete Data Destination by ID' }),
    ApiParam({ name: 'id', description: 'Data Destination ID' }),
    ApiOkResponse({ description: 'Data Destination successfully deleted' })
  );
}

export function GetDataDestinationImpactSpec() {
  return applyDecorators(
    ApiOperation({
      summary:
        'Get usage impact for a Data Destination (reports + distinct data marts referencing it)',
    }),
    ApiParam({ name: 'id', description: 'Data Destination ID' }),
    ApiOkResponse({ type: DataDestinationImpactResponseApiDto })
  );
}

export function RotateSecretKeySpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Rotate secret key for Data Destination' }),
    ApiParam({ name: 'id', description: 'Data Destination ID' }),
    ApiCreatedResponse({ type: DataDestinationResponseApiDto })
  );
}

export function OAuthSettingsSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get Google OAuth settings for Data Destinations' }),
    ApiOkResponse({
      type: GoogleOAuthSettingsResponseDto,
      description: 'OAuth configuration settings',
    })
  );
}

export function OAuthAuthorizeSpec(withDestinationId = false) {
  return applyDecorators(
    ApiOperation({
      summary: withDestinationId
        ? 'Generate Google OAuth authorization URL for a Data Destination'
        : 'Generate Google OAuth authorization URL for Data Destination credentials',
    }),
    ...(withDestinationId ? [ApiParam({ name: 'id', description: 'Data Destination ID' })] : []),
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
    ApiOperation({ summary: 'Exchange OAuth authorization code for tokens (Data Destination)' }),
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

export function McpGoogleSheetsSetupStartSpec() {
  return applyDecorators(
    ApiOperation({
      summary:
        'Start an MCP-initiated Google Sheets destination setup (redirects straight to Google)',
    }),
    ApiQuery({ name: 'token', description: 'Short-lived signed MCP destination setup token' }),
    ApiResponse({ status: 302, description: 'Redirect to Google OAuth consent screen' }),
    ApiResponse({ status: 400, description: 'Invalid or expired setup token' })
  );
}

export function McpGoogleSheetsSetupFinishSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Finish an MCP-initiated Google Sheets destination setup',
    }),
    ApiBody({ type: FinishMcpGoogleSheetsSetupRequestDto }),
    ApiOkResponse({
      type: FinishMcpGoogleSheetsSetupResponseDto,
      description: 'Destination created successfully',
    }),
    ApiResponse({ status: 400, description: 'Invalid authorization code or state' })
  );
}

export function OAuthCredentialStatusSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get OAuth credential status by credential ID' }),
    ApiParam({ name: 'credentialId', description: 'OAuth Credential ID' }),
    ApiOkResponse({ type: GoogleOAuthStatusResponseDto, description: 'OAuth credential status' }),
    ApiResponse({ status: 403, description: 'Credential does not belong to your project' })
  );
}

export function OAuthStatusSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get OAuth status for a Data Destination' }),
    ApiParam({ name: 'id', description: 'Data Destination ID' }),
    ApiOkResponse({ type: GoogleOAuthStatusResponseDto, description: 'OAuth connection status' })
  );
}

export function OAuthRevokeSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Revoke Google OAuth credentials for a Data Destination' }),
    ApiParam({ name: 'id', description: 'Data Destination ID' }),
    ApiNoContentResponse({ description: 'OAuth credentials revoked' })
  );
}

export function CreateGoogleSheetDocumentSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Auto-create a new Google Sheet for a Data Destination (Google Sheets)',
    }),
    ApiParam({ name: 'id', description: 'Data Destination ID' }),
    ApiBody({ type: CreateGoogleSheetDocumentRequestDto }),
    ApiOkResponse({
      type: CreateGoogleSheetDocumentResponseDto,
      description: 'Identifiers of the newly created Google Sheet',
    }),
    ApiResponse({
      status: 400,
      description:
        'Destination has no connected Google account, or is not a Google Sheets destination',
    })
  );
}

export function UpdateDataDestinationAvailabilitySpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Update Data Destination availability' }),
    ApiParam({ name: 'id', description: 'Data Destination ID' }),
    ApiBody({ type: UpdateDestinationAvailabilityApiDto }),
    ApiNoContentResponse({ description: 'Data Destination availability updated' })
  );
}
