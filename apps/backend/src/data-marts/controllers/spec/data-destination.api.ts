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
import { CreateConnectGoogleSheetsDestinationApiDto } from '../../dto/presentation/create-connect-google-sheets-destination-api.dto';
import { UpdateDataDestinationApiDto } from '../../dto/presentation/update-data-destination-api.dto';
import { UpdateDestinationAvailabilityApiDto } from '../../dto/presentation/update-availability-api.dto';
import { DataDestinationResponseApiDto } from '../../dto/presentation/data-destination-response-api.dto';
import { DataDestinationImpactResponseApiDto } from '../../dto/presentation/data-destination-impact-response-api.dto';
import { DataDestinationByTypeResponseApiDto } from '../../dto/presentation/data-destination-by-type-response-api.dto';
import { GoogleOAuthSettingsResponseDto } from '../../dto/presentation/google-oauth/oauth-settings-response.dto';
import { CreateGoogleSheetDocumentRequestDto } from '../../dto/presentation/google-sheets/create-google-sheet-document-request.dto';
import { CreateGoogleSheetDocumentResponseDto } from '../../dto/presentation/google-sheets/create-google-sheet-document-response.dto';
import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';
import { OwnerFilter } from '../../enums/owner-filter.enum';

export function ListDataDestinationsByTypeSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'List Data Destinations by type' }),
    ApiParam({ name: 'type', description: 'Data Destination type', enum: DataDestinationType }),
    ApiOkResponse({ type: [DataDestinationByTypeResponseApiDto] })
  );
}

export function CreateDataDestinationSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Create a new Data Destination' }),
    ApiBody({ type: CreateDataDestinationApiDto }),
    ApiCreatedResponse({ type: DataDestinationResponseApiDto }),
    ApiResponse({
      status: 400,
      description:
        'reusableCredentialId is null, missing where the type needs it, sent with credentials or for a type that takes no Credential, or names a Credential that does not fit the type or is disabled; or the request sends credentialId, sourceDestinationId, a Google Sheets key or a Google Chat webhook URL ("This page is out of date. Reload it.")',
    }),
    ApiResponse({
      status: 403,
      description:
        'no USE on the Credential ("You cannot use this Credential."), or a plugin-authenticated request that sends reusableCredentialId',
    }),
    ApiResponse({ status: 404, description: 'Credential not found' })
  );
}

export function CreateConnectGoogleSheetsDestinationSpec() {
  return applyDecorators(
    ApiOperation({
      summary:
        'Create a Google Sheets destination bound to a Credential from the MCP connect flow (starts unshared internally)',
    }),
    ApiBody({ type: CreateConnectGoogleSheetsDestinationApiDto }),
    ApiCreatedResponse({ type: DataDestinationResponseApiDto }),
    ApiResponse({
      status: 400,
      description: 'The Credential does not fit Google Sheets or is disabled',
    }),
    ApiResponse({ status: 403, description: 'No USE on the Credential' }),
    ApiResponse({ status: 404, description: 'Credential not found' })
  );
}

export function ResolveExcelDestinationSpec() {
  return applyDecorators(
    ApiOperation({
      summary: "Get the project's Excel destination, creating it on first use",
      description:
        'An Excel destination carries no credentials and no configuration, so there is nothing ' +
        'for a user to fill in: it is created on demand the first time a report is made from ' +
        'the Excel add-in. Resolved by access rather than by ownership: any Excel destination ' +
        'in the project the caller may use is returned, whoever created it, and a new one is ' +
        'created only when none is reachable. A created one is shared for use straight away, ' +
        'so the next caller is handed that one instead of getting another. Safe to call ' +
        'repeatedly.',
    }),
    ApiOkResponse({ type: DataDestinationResponseApiDto })
  );
}

export function UpdateDataDestinationSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Update Data Destination by ID' }),
    ApiParam({ name: 'id', description: 'Data Destination ID' }),
    ApiBody({ type: UpdateDataDestinationApiDto }),
    ApiOkResponse({ type: DataDestinationResponseApiDto }),
    ApiResponse({
      status: 400,
      description:
        'reusableCredentialId is null, missing where the type needs it, sent with credentials or for a type that takes no Credential, or names a Credential that does not fit the type or is disabled; or the request sends credentialId, sourceDestinationId, a Google Sheets key or a Google Chat webhook URL ("This page is out of date. Reload it.")',
    }),
    ApiResponse({
      status: 403,
      description:
        'No EDIT on the Destination, no USE on the Credential ("You cannot use this Credential."), or a plugin-authenticated request that sends reusableCredentialId',
    }),
    ApiResponse({ status: 404, description: 'Destination or Credential not found' })
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
