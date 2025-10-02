import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConnectorDefinitionResponseApiDto } from '../../dto/presentation/connector-definition-response-api.dto';
import { ConnectorSpecificationResponseApiDto } from '../../dto/presentation/connector-specification-response-api.dto';
import { ConnectorFieldsResponseApiDto } from '../../dto/presentation/connector-fields-response-api.dto';

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
