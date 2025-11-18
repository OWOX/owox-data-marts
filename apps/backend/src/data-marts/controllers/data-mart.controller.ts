import { Controller, Get, Post, Body, Param, Put, Delete, Query, HttpCode } from '@nestjs/common';
import { CreateDataMartRequestApiDto } from '../dto/presentation/create-data-mart-request-api.dto';
import { CreateDataMartResponseApiDto } from '../dto/presentation/create-data-mart-response-api.dto';
import { DataMartResponseApiDto } from '../dto/presentation/data-mart-response-api.dto';
import { UpdateDataMartDefinitionApiDto } from '../dto/presentation/update-data-mart-definition-api.dto';
import { UpdateDataMartTitleApiDto } from '../dto/presentation/update-data-mart-title-api.dto';
import { UpdateDataMartDescriptionApiDto } from '../dto/presentation/update-data-mart-description-api.dto';

import { DataMartMapper } from '../mappers/data-mart.mapper';
import { ListDataMartsService } from '../use-cases/list-data-marts.service';
import { GetDataMartService } from '../use-cases/get-data-mart.service';
import { CreateDataMartService } from '../use-cases/create-data-mart.service';
import { UpdateDataMartDefinitionService } from '../use-cases/update-data-mart-definition.service';
import { UpdateDataMartTitleService } from '../use-cases/update-data-mart-title.service';
import { UpdateDataMartDescriptionService } from '../use-cases/update-data-mart-description.service';
import { PublishDataMartService } from '../use-cases/publish-data-mart.service';
import { DeleteDataMartService } from '../use-cases/delete-data-mart.service';
import { CancelDataMartRunService } from '../use-cases/cancel-data-mart-run.service';
import { ApiTags } from '@nestjs/swagger';
import {
  CreateDataMartSpec,
  GetDataMartSpec,
  ListDataMartsSpec,
  PublishDataMartSpec,
  UpdateDataMartDefinitionSpec,
  UpdateDataMartDescriptionSpec,
  UpdateDataMartTitleSpec,
  DeleteDataMartSpec,
  RunDataMartSpec,
  ValidateDataMartDefinitionSpec,
  UpdateDataMartSchemaSpec,
  GetDataMartRunsSpec,
  CancelDataMartRunSpec,
  ListDataMartsByConnectorNameSpec,
} from './spec/data-mart.api';
import { AuthContext, AuthorizationContext, Auth, Role, Strategy } from '../../idp';
import { RunDataMartService } from '../use-cases/run-data-mart.service';
import { ValidateDataMartDefinitionService } from '../use-cases/validate-data-mart-definition.service';
import { UpdateDataMartSchemaService } from '../use-cases/update-data-mart-schema.service';
import { DataMartValidationResponseApiDto } from '../dto/presentation/data-mart-validation-response-api.dto';
import { DataMartRunsResponseApiDto } from '../dto/presentation/data-mart-runs-response-api.dto';
import { UpdateDataMartSchemaApiDto } from '../dto/presentation/update-data-mart-schema-api.dto';
import { RunDataMartRequestApiDto } from '../dto/presentation/run-data-mart-request-api.dto';
import { ListDataMartsByConnectorNameService } from '../use-cases/list-data-marts-by-connector-name.service';
import { ListDataMartRunsService } from '../use-cases/list-data-mart-runs.service';
import { GetDataMartRunService } from '../use-cases/get-data-mart-run.service';
import { DataMartRunResponseApiDto } from '../dto/presentation/data-mart-run-response-api.dto';
import { GetDataMartRunByIdSpec } from './spec/data-mart.api';

@Controller('data-marts')
@ApiTags('DataMarts')
export class DataMartController {
  constructor(
    private readonly createDataMartService: CreateDataMartService,
    private readonly listDataMartsService: ListDataMartsService,
    private readonly getDataMartService: GetDataMartService,
    private readonly updateDefinitionService: UpdateDataMartDefinitionService,
    private readonly updateTitleService: UpdateDataMartTitleService,
    private readonly updateDescriptionService: UpdateDataMartDescriptionService,
    private readonly publishDataMartService: PublishDataMartService,
    private readonly deleteDataMartService: DeleteDataMartService,
    private readonly mapper: DataMartMapper,
    private readonly runDataMartService: RunDataMartService,
    private readonly validateDefinitionService: ValidateDataMartDefinitionService,
    private readonly updateSchemaService: UpdateDataMartSchemaService,
    private readonly getDataMartRunsService: ListDataMartRunsService,
    private readonly getDataMartRunService: GetDataMartRunService,
    private readonly cancelDataMartRunService: CancelDataMartRunService,
    private readonly listDataMartsByConnectorNameService: ListDataMartsByConnectorNameService
  ) {}

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Post()
  @CreateDataMartSpec()
  async create(
    @AuthContext() context: AuthorizationContext,
    @Body() dto: CreateDataMartRequestApiDto
  ): Promise<CreateDataMartResponseApiDto> {
    const command = this.mapper.toCreateDomainCommand(context, dto);
    const dataMart = await this.createDataMartService.run(command);
    return this.mapper.toCreateResponse(dataMart);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  @ListDataMartsSpec()
  async list(
    @AuthContext() context: AuthorizationContext,
    @Query('connectorName') connectorName?: string
  ): Promise<DataMartResponseApiDto[]> {
    const command = this.mapper.toListCommand(context, connectorName);
    const dataMarts = await this.listDataMartsService.run(command);
    return this.mapper.toResponseList(dataMarts);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get('by-connector/:connectorName')
  @ListDataMartsByConnectorNameSpec()
  async listDataMartsByConnectorName(
    @AuthContext() context: AuthorizationContext,
    @Param('connectorName') connectorName: string
  ): Promise<DataMartResponseApiDto[]> {
    const command = this.mapper.toListDataMartsByConnectorNameCommand(connectorName, context);
    const dataMarts = await this.listDataMartsByConnectorNameService.run(command);
    return this.mapper.toResponseList(dataMarts);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get(':id')
  @GetDataMartSpec()
  async get(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<DataMartResponseApiDto> {
    const command = this.mapper.toGetCommand(id, context);
    const dataMart = await this.getDataMartService.run(command);
    return this.mapper.toResponse(dataMart);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Put(':id/definition')
  @UpdateDataMartDefinitionSpec()
  async updateDefinition(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string,
    @Body() dto: UpdateDataMartDefinitionApiDto
  ): Promise<DataMartResponseApiDto> {
    const command = this.mapper.toUpdateDefinitionCommand(id, context, dto);
    const dataMart = await this.updateDefinitionService.run(command);
    return this.mapper.toResponse(dataMart);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Put(':id/title')
  @UpdateDataMartTitleSpec()
  async updateTitle(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string,
    @Body() dto: UpdateDataMartTitleApiDto
  ): Promise<DataMartResponseApiDto> {
    const command = this.mapper.toUpdateTitleCommand(id, context, dto);
    const dataMart = await this.updateTitleService.run(command);
    return this.mapper.toResponse(dataMart);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Put(':id/description')
  @UpdateDataMartDescriptionSpec()
  async updateDescription(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string,
    @Body() dto: UpdateDataMartDescriptionApiDto
  ): Promise<DataMartResponseApiDto> {
    const command = this.mapper.toUpdateDescriptionCommand(id, context, dto);
    const dataMart = await this.updateDescriptionService.run(command);
    return this.mapper.toResponse(dataMart);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Put(':id/publish')
  @PublishDataMartSpec()
  async publish(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<DataMartResponseApiDto> {
    const command = this.mapper.toPublishCommand(id, context);
    const dataMart = await this.publishDataMartService.run(command);
    return this.mapper.toResponse(dataMart);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Delete(':id')
  @DeleteDataMartSpec()
  async delete(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<void> {
    const command = this.mapper.toDeleteCommand(id, context);
    await this.deleteDataMartService.run(command);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Post(':id/manual-run')
  @RunDataMartSpec()
  async manualRun(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string,
    @Body() dto: RunDataMartRequestApiDto
  ): Promise<{ runId: string }> {
    const command = this.mapper.toRunCommand(id, context, dto.payload);
    const runId = await this.runDataMartService.run(command);
    return { runId };
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Post(':id/runs/:runId/cancel')
  @CancelDataMartRunSpec()
  @HttpCode(204)
  async cancelRun(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string,
    @Param('runId') runId: string
  ): Promise<void> {
    const command = this.mapper.toCancelRunCommand(id, runId, context);
    await this.cancelDataMartRunService.run(command);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Post(':id/validate-definition')
  @ValidateDataMartDefinitionSpec()
  async validate(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<DataMartValidationResponseApiDto> {
    const command = this.mapper.toDefinitionValidateCommand(id, context);
    const validationResult = await this.validateDefinitionService.run(command);
    return this.mapper.toDefinitionValidationResponse(validationResult);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Put(':id/schema')
  @UpdateDataMartSchemaSpec()
  async updateSchema(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string,
    @Body() dto: UpdateDataMartSchemaApiDto
  ): Promise<DataMartResponseApiDto> {
    const command = this.mapper.toUpdateSchemaCommand(id, context, dto);
    const dataMart = await this.updateSchemaService.run(command);
    return this.mapper.toResponse(dataMart);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get(':id/runs')
  @GetDataMartRunsSpec()
  async getRunHistory(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string,
    @Query('limit') limit: number = 20,
    @Query('offset') offset: number = 0
  ): Promise<DataMartRunsResponseApiDto> {
    const command = this.mapper.toGetDataMartRunsCommand(id, context, limit, offset);
    const runs = await this.getDataMartRunsService.run(command);
    return this.mapper.toRunsResponse(runs);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get(':id/runs/:runId')
  @GetDataMartRunByIdSpec()
  async getRunById(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string,
    @Param('runId') runId: string
  ): Promise<DataMartRunResponseApiDto> {
    const command = this.mapper.toGetDataMartRunCommand(id, runId, context);
    const runDto = await this.getDataMartRunService.run(command);
    return this.mapper.toRunResponse(runDto);
  }
}
