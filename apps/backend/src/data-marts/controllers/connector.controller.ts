import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AvailableConnectorService } from '../use-cases/connector/available-connector.service';
import {
  GetAvailableConnectorsSpec,
  GetConnectorSpecificationSpec,
  GetConnectorFieldsSpec,
  ExchangeOAuthCredentialsSpec,
  GetConnectorOAuthStatusSpec,
  GetConnectorOAuthSettingsSpec,
} from './spec/connector.api';
import { ConnectorDefinitionResponseApiDto } from '../dto/presentation/connector-definition-response-api.dto';
import { ConnectorSpecificationResponseApiDto } from '../dto/presentation/connector-specification-response-api.dto';
import { ConnectorFieldsResponseApiDto } from '../dto/presentation/connector-fields-response-api.dto';
import { SpecificationConnectorService } from '../use-cases/connector/specification-connector.service';
import { FieldsConnectorService } from '../use-cases/connector/fields-connector.service';
import { ConnectorMapper } from '../mappers/connector.mapper';
import { Auth, AuthorizationContext, AuthContext } from '../../idp';
import { Role } from '../../idp/types/role-config.types';
import { ExchangeOAuthCredentialsDto } from '../dto/presentation/exchange-oauth-credentials.dto';
import { ConnectorOAuthCredentialsResponseApiDto } from '../dto/presentation/connector-oauth-credentials-response-api.dto';
import { ConnectorOauthService } from '../services/connector/connector-oauth.service';
import { ConnectorOAuthStatusResponseApiDto } from '../dto/presentation/connector-oauth-credentials-status-response-api.dto';
import { ConnectorOAuthSettingsResponseApiDto } from '../dto/presentation/connector-oauth-settings-response-api.dto';

@Controller('connectors')
@ApiTags('Connectors')
export class ConnectorController {
  constructor(
    private readonly availableConnectorService: AvailableConnectorService,
    private readonly specificationConnectorService: SpecificationConnectorService,
    private readonly fieldsConnectorService: FieldsConnectorService,
    private readonly mapper: ConnectorMapper,
    private readonly connectorOauthService: ConnectorOauthService
  ) {}

  @Auth(Role.none())
  @Get()
  @GetAvailableConnectorsSpec()
  async getAvailableConnectors(): Promise<ConnectorDefinitionResponseApiDto[]> {
    const connectors = await this.availableConnectorService.run();
    return this.mapper.toDefinitionResponseList(connectors);
  }

  @Auth(Role.none())
  @Get(':connectorName/specification')
  @GetConnectorSpecificationSpec()
  async getConnectorSpecification(
    @Param('connectorName') connectorName: string
  ): Promise<ConnectorSpecificationResponseApiDto[]> {
    const specification = await this.specificationConnectorService.run(connectorName);
    return this.mapper.toSpecificationResponse(specification);
  }

  @Auth(Role.none())
  @Get(':connectorName/fields')
  @GetConnectorFieldsSpec()
  async getConnectorFields(
    @Param('connectorName') connectorName: string
  ): Promise<ConnectorFieldsResponseApiDto[]> {
    const fields = await this.fieldsConnectorService.run(connectorName);
    return this.mapper.toFieldsResponse(fields);
  }

  @Auth(Role.viewer())
  @Get(':connectorName/oauth/settings')
  @GetConnectorOAuthSettingsSpec()
  async getConnectorOAuthSettings(
    @Param('connectorName') connectorName: string,
    @Query('path') path: string
  ): Promise<ConnectorOAuthSettingsResponseApiDto> {
    const settings = await this.connectorOauthService.getOAuthSettings(connectorName, path);
    return this.mapper.toSettingsResponse(settings);
  }

  @Auth(Role.editor())
  @Post(':connectorName/oauth/exchange')
  @ExchangeOAuthCredentialsSpec()
  async handleOAuthCallback(
    @AuthContext() context: AuthorizationContext,
    @Param('connectorName') connectorName: string,
    @Body() body: ExchangeOAuthCredentialsDto
  ): Promise<ConnectorOAuthCredentialsResponseApiDto> {
    const result = await this.connectorOauthService.exchangeCredentials(
      context.projectId,
      context.userId,
      connectorName,
      body.fieldPath,
      body.payload
    );

    return this.mapper.toCredentialsResponse(result);
  }

  @Auth(Role.viewer())
  @Get(':connectorName/oauth/status/:credentialId')
  @GetConnectorOAuthStatusSpec()
  async getConnectorOAuthStatus(
    @Param('connectorName') connectorName: string,
    @Param('credentialId') credentialId: string
  ): Promise<ConnectorOAuthStatusResponseApiDto> {
    const status = await this.connectorOauthService.getCredentialStatus(
      connectorName,
      credentialId
    );
    return this.mapper.toStatusResponse(status);
  }
}
