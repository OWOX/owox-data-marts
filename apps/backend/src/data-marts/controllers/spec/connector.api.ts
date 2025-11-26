import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConnectorDefinitionResponseApiDto } from '../../dto/presentation/connector-definition-response-api.dto';
import { ConnectorSpecificationResponseApiDto } from '../../dto/presentation/connector-specification-response-api.dto';
import { ConnectorFieldsResponseApiDto } from '../../dto/presentation/connector-fields-response-api.dto';
import { ConnectorOAuthCredentialsResponseApiDto } from '../../dto/presentation/connector-oauth-credentials-response-api.dto';
import { ConnectorOAuthStatusResponseApiDto } from 'src/data-marts/dto/presentation/connector-oauth-credentials-status-response-api.dto';
import { ConnectorOAuthSettingsResponseApiDto } from '../../dto/presentation/connector-oauth-settings-response-api.dto';

export function GetAvailableConnectorsSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get available connectors' }),
    ApiResponse({ status: 200, type: [ConnectorDefinitionResponseApiDto] })
  );
}

export function GetConnectorSpecificationSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get connector specification' }),
    ApiResponse({ status: 200, type: ConnectorSpecificationResponseApiDto })
  );
}

export function GetConnectorFieldsSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get connector fields' }),
    ApiResponse({ status: 200, type: [ConnectorFieldsResponseApiDto] })
  );
}

export function ExchangeOAuthCredentialsSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Exchange OAuth credentials for a connector' }),
    ApiResponse({ status: 200, type: ConnectorOAuthCredentialsResponseApiDto })
  );
}

export function GetConnectorOAuthStatusSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get connector OAuth status' }),
    ApiResponse({ status: 200, type: ConnectorOAuthStatusResponseApiDto })
  );
}

export function GetConnectorOAuthSettingsSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get OAuth settings (UI variables) for a connector' }),
    ApiResponse({ status: 200, type: ConnectorOAuthSettingsResponseApiDto })
  );
}
