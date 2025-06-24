import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AvailableConnectorService } from '../use-cases/connector/available-connector.service';
import {
  GetAvailableConnectorsSpec,
  GetConnectorSpecificationSpec,
  GetConnectorFieldsSpec,
} from './spec/connector.api';
import { ConnectorDefinitionResponseApiDto } from '../dto/presentation/connector-definition-response-api.dto';
import { ConnectorSpecificationResponseApiDto } from '../dto/presentation/connector-specification-response-api.dto';
import { ConnectorFieldsResponseApiDto } from '../dto/presentation/connector-fields-response-api.dto';
import { SpecificationConnectorService } from '../use-cases/connector/specification-connector.service';
import { FieldsConnectorService } from '../use-cases/connector/fields-connector.service';
import { ConnectorMapper } from '../mappers/connector.mapper';

@Controller('connectors')
@ApiTags('Connectors')
export class ConnectorController {
  constructor(
    private readonly availableConnectorService: AvailableConnectorService,
    private readonly specificationConnectorService: SpecificationConnectorService,
    private readonly fieldsConnectorService: FieldsConnectorService,
    private readonly mapper: ConnectorMapper
  ) {}

  @Get()
  @GetAvailableConnectorsSpec()
  async getAvailableConnectors(): Promise<ConnectorDefinitionResponseApiDto[]> {
    const connectors = await this.availableConnectorService.run();
    return this.mapper.toDefinitionResponseList(connectors);
  }

  @Get(':connectorName/specification')
  @GetConnectorSpecificationSpec()
  async getConnectorSpecification(
    @Param('connectorName') connectorName: string
  ): Promise<ConnectorSpecificationResponseApiDto[]> {
    const specification = await this.specificationConnectorService.run(connectorName);
    return this.mapper.toSpecificationResponse(specification);
  }

  @Get(':connectorName/fields')
  @GetConnectorFieldsSpec()
  async getConnectorFields(
    @Param('connectorName') connectorName: string
  ): Promise<ConnectorFieldsResponseApiDto[]> {
    const fields = await this.fieldsConnectorService.run(connectorName);
    return this.mapper.toFieldsResponse(fields);
  }
}
