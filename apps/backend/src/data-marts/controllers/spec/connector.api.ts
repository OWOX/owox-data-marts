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

export function ExchangeOAuthCredentialsSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Exchange OAuth credentials for a connector' }),
    ApiParam({ name: 'connectorName', description: 'Connector name' }),
    ApiBody({ type: ExchangeOAuthCredentialsDto }),
    ApiCreatedResponse({
      type: ConnectorOAuthCredentialsResponseApiDto,
      description: 'OAuth credentials exchanged successfully',
    }),
    ApiResponse({ status: 400, description: 'Invalid OAuth credentials payload' })
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
