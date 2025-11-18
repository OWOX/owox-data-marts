import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RunType } from '../../common/scheduler/shared/types';
import { Auth, AuthContext, AuthorizationContext, Role, Strategy } from '../../idp';
import { CreateInsightRequestApiDto } from '../dto/presentation/create-insight-request-api.dto';
import { InsightResponseApiDto } from '../dto/presentation/insight-response-api.dto';
import { RunInsightResponseApiDto } from '../dto/presentation/run-insight-response-api.dto';
import { UpdateInsightRequestApiDto } from '../dto/presentation/update-insight-request-api.dto';
import { UpdateInsightTitleApiDto } from '../dto/presentation/update-insight-title-api.dto';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { InsightMapper } from '../mappers/insight.mapper';
import { DataMartRunService } from '../services/data-mart-run.service';
import { CreateInsightService } from '../use-cases/create-insight.service';
import { DeleteInsightService } from '../use-cases/delete-insight.service';
import { GetInsightService } from '../use-cases/get-insight.service';
import { ListInsightsService } from '../use-cases/list-insights.service';
import { RunInsightCommand, RunInsightService } from '../use-cases/run-insight.service';
import { UpdateInsightTitleService } from '../use-cases/update-insight-title.service';
import { UpdateInsightService } from '../use-cases/update-insight.service';
import {
  CreateInsightSpec,
  DeleteInsightSpec,
  GetInsightSpec,
  ListInsightsSpec,
  RunInsightSpec,
  UpdateInsightSpec,
  UpdateInsightTitleSpec,
} from './spec/insight.api';

@Controller('data-marts/:dataMartId/insights')
@ApiTags('Insights')
export class InsightController {
  constructor(
    private readonly createInsightService: CreateInsightService,
    private readonly getInsightService: GetInsightService,
    private readonly listInsightsService: ListInsightsService,
    private readonly updateInsightService: UpdateInsightService,
    private readonly deleteInsightService: DeleteInsightService,
    private readonly updateInsightTitleService: UpdateInsightTitleService,
    private readonly runInsightService: RunInsightService,
    private readonly mapper: InsightMapper,
    private readonly dataMartRunService: DataMartRunService,
    private readonly dataMartMapper: DataMartMapper
  ) {}

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Post()
  @CreateInsightSpec()
  async create(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Body() dto: CreateInsightRequestApiDto
  ): Promise<InsightResponseApiDto> {
    const command = this.mapper.toCreateDomainCommand(dataMartId, context, dto);
    const insight = await this.createInsightService.run(command);
    return this.mapper.toResponse(insight);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  @ListInsightsSpec()
  async list(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string
  ): Promise<{ data: InsightResponseApiDto[] }> {
    const command = this.mapper.toListCommand(dataMartId, context);
    const insights = await this.listInsightsService.run(command);
    return { data: this.mapper.toListItemResponseList(insights) };
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get(':insightId')
  @GetInsightSpec()
  async get(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('insightId') insightId: string
  ): Promise<InsightResponseApiDto> {
    const command = this.mapper.toGetCommand(insightId, dataMartId, context);
    const insight = await this.getInsightService.run(command);

    const response = this.mapper.toResponse(insight);

    const lastRunEntity = await this.dataMartRunService.getLatestInsightManualRun(
      dataMartId,
      insightId
    );
    if (lastRunEntity) {
      const runDto = this.dataMartMapper.toDataMartRunDto(lastRunEntity);
      response.lastDataMartRun = await this.dataMartMapper.toRunResponse(runDto);
    } else {
      response.lastDataMartRun = null;
    }

    return response;
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Put(':insightId')
  @UpdateInsightSpec()
  async update(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('insightId') insightId: string,
    @Body() dto: UpdateInsightRequestApiDto
  ): Promise<InsightResponseApiDto> {
    const command = this.mapper.toUpdateCommand(insightId, dataMartId, context, dto);
    const insight = await this.updateInsightService.run(command);
    return this.mapper.toResponse(insight);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Put(':insightId/title')
  @UpdateInsightTitleSpec()
  async updateTitle(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('insightId') insightId: string,
    @Body() dto: UpdateInsightTitleApiDto
  ): Promise<InsightResponseApiDto> {
    const command = this.mapper.toUpdateTitleCommand(insightId, dataMartId, context, dto);
    const insight = await this.updateInsightTitleService.run(command);
    return this.mapper.toResponse(insight);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Delete(':insightId')
  @DeleteInsightSpec()
  @HttpCode(204)
  async delete(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('insightId') insightId: string
  ): Promise<void> {
    const command = this.mapper.toDeleteCommand(insightId, dataMartId, context);
    await this.deleteInsightService.run(command);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Post(':insightId/run')
  @RunInsightSpec()
  async run(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('insightId') insightId: string
  ): Promise<RunInsightResponseApiDto> {
    const command = new RunInsightCommand(
      dataMartId,
      context.projectId,
      insightId,
      context.userId,
      RunType.manual
    );
    const runId = await this.runInsightService.run(command);
    return { runId };
  }
}
