import { applyDecorators } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { ConnectorDefinitionResponseApiDto } from '../../dto/presentation/connector-definition-response-api.dto';
import { ConnectorSpecificationResponseApiDto } from '../../dto/presentation/connector-specification-response-api.dto';
import { ConnectorFieldsResponseApiDto } from '../../dto/presentation/connector-fields-response-api.dto';
import { ConnectorOAuthCredentialsResponseApiDto } from '../../dto/presentation/connector-oauth-credentials-response-api.dto';
import { ConnectorOAuthStatusResponseApiDto } from '../../dto/presentation/connector-oauth-credentials-status-response-api.dto';
import { ConnectorOAuthSettingsResponseApiDto } from '../../dto/presentation/connector-oauth-settings-response-api.dto';
import { ExchangeOAuthCredentialsDto } from '../../dto/presentation/exchange-oauth-credentials.dto';
import { ConnectorFieldsPreviewRequestApiDto } from '../../dto/presentation/connector-fields-preview-request-api.dto';
import { ConnectorFieldOptionsPreviewRequestApiDto } from '../../dto/presentation/connector-field-options-preview-request-api.dto';
import { ConnectorFieldOptionResponseApiDto } from '../../dto/presentation/connector-field-option-response-api.dto';
import { ConnectorPickerTokenResponseApiDto } from '../../dto/presentation/connector-picker-token-response-api.dto';

export function GetAvailableConnectorsSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get available connectors' }),
    ApiOkResponse({ type: ConnectorDefinitionResponseApiDto, isArray: true })
  );
}

export function GetConnectorSpecificationSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get connector specification' }),
    ApiParam({ name: 'connectorName', description: 'Connector name' }),
    ApiOkResponse({ type: ConnectorSpecificationResponseApiDto, isArray: true }),
    ApiResponse({ status: 404, description: 'Connector not found' })
  );
}

export function GetConnectorFieldsSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get connector fields' }),
    ApiParam({ name: 'connectorName', description: 'Connector name' }),
    ApiOkResponse({ type: ConnectorFieldsResponseApiDto, isArray: true }),
    ApiResponse({ status: 404, description: 'Connector not found' })
  );
}

export function PreviewConnectorFieldsSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Preview fields from a connector source configuration' }),
    ApiParam({ name: 'connectorName', description: 'Connector name' }),
    ApiBody({ type: ConnectorFieldsPreviewRequestApiDto }),
    ApiOkResponse({ type: ConnectorFieldsResponseApiDto, isArray: true }),
    ApiResponse({ status: 400, description: 'Unable to preview connector fields' }),
    ApiResponse({ status: 403, description: 'Connector credentials cannot access the resource' }),
    ApiResponse({ status: 502, description: 'Connector provider is unavailable' }),
    ApiResponse({ status: 504, description: 'Connector field preview timed out' })
  );
}

export function PreviewConnectorFieldOptionsSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Preview the allowed values of a connector configuration field',
      description:
        'Resolves the options of a field declared with the DYNAMIC_OPTIONS attribute from the source, for example the sheet tabs of the selected spreadsheet.',
    }),
    ApiParam({ name: 'connectorName', description: 'Connector name' }),
    ApiBody({ type: ConnectorFieldOptionsPreviewRequestApiDto }),
    ApiOkResponse({ type: ConnectorFieldOptionResponseApiDto, isArray: true }),
    ApiResponse({ status: 400, description: 'Unable to preview connector field options' }),
    ApiResponse({ status: 403, description: 'Connector credentials cannot access the resource' }),
    ApiResponse({ status: 502, description: 'Connector provider is unavailable' }),
    ApiResponse({ status: 504, description: 'Connector field options preview timed out' })
  );
}

export function ExchangeOAuthCredentialsSpec() {
  return applyDecorators(
    ApiOperation({
      summary: "Connect a Source Credential through the connector's OAuth app",
      description:
        "Creates a Credential of the sign-in variant, or reconnects `credential.id`; returns Google Picker's access token only for a connector that opens Picker.",
    }),
    ApiParam({ name: 'connectorName', description: 'Connector name' }),
    ApiBody({ type: ExchangeOAuthCredentialsDto }),
    ApiCreatedResponse({
      type: ConnectorOAuthCredentialsResponseApiDto,
      description: 'The Credential was created or reconnected',
    }),
    ApiResponse({
      status: 400,
      description: 'Invalid OAuth credentials payload, or no `credential` target',
    })
  );
}

export function GetConnectorOAuthStatusSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get connector OAuth status' }),
    ApiParam({ name: 'connectorName', description: 'Connector name' }),
    ApiParam({ name: 'credentialId', description: 'OAuth credential ID' }),
    ApiOkResponse({
      type: ConnectorOAuthStatusResponseApiDto,
      description: 'OAuth credential status',
    })
  );
}

export function IssuePickerTokenSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Issue a Google Picker token for a Source Credential',
      description:
        "Refreshes the Credential's access token for Google Picker; only for the member who signed the Credential in last, while they can edit it.",
    }),
    ApiParam({ name: 'connectorName', description: 'Connector name' }),
    ApiParam({ name: 'credentialId', description: 'Source Credential ID' }),
    ApiCreatedResponse({ type: ConnectorPickerTokenResponseApiDto }),
    ApiResponse({
      status: 400,
      description:
        "The Credential's connector opens no Google Picker, or its connector credentials are invalid or expired",
    }),
    ApiResponse({
      status: 403,
      description: 'The caller is not the member who signed the Credential in, or cannot edit it',
    })
  );
}

export function GetConnectorOAuthSettingsSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get OAuth settings (UI variables) for a connector' }),
    ApiParam({ name: 'connectorName', description: 'Connector name' }),
    ApiQuery({
      name: 'path',
      required: true,
      type: String,
      example: 'AuthType.oauth2',
      description: 'Path to the OAuth configuration in connector specification',
    }),
    ApiOkResponse({
      type: ConnectorOAuthSettingsResponseApiDto,
      description: 'OAuth UI settings',
    }),
    ApiResponse({ status: 404, description: 'Connector not found' })
  );
}
