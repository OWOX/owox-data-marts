import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, AuthorizationContext, Role, Strategy } from '../../idp';
import { CreateInsightRequestApiDto } from '../dto/presentation/create-insight-request-api.dto';
import { InsightResponseApiDto } from '../dto/presentation/insight-response-api.dto';
import { UpdateInsightRequestApiDto } from '../dto/presentation/update-insight-request-api.dto';
import { UpdateInsightTitleApiDto } from '../dto/presentation/update-insight-title-api.dto';
import { InsightListItemResponseApiDto } from '../dto/presentation/insight-list-item-response-api.dto';
import { InsightMapper } from '../mappers/insight.mapper';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';
import { CreateInsightService } from '../use-cases/create-insight.service';
import { CreateInsightWithAiService } from '../use-cases/create-insight-with-ai.service';
import { DeleteInsightService } from '../use-cases/delete-insight.service';
import { GetInsightService } from '../use-cases/get-insight.service';
import { ListInsightsService } from '../use-cases/list-insights.service';
import { UpdateInsightTitleService } from '../use-cases/update-insight-title.service';
import { UpdateInsightService } from '../use-cases/update-insight.service';
import {
  CreateInsightSpec,
  CreateInsightWithAiSpec,
  DeleteInsightSpec,
  GetInsightSpec,
  ListInsightsSpec,
  UpdateInsightSpec,
  UpdateInsightTitleSpec,
} from './spec/insight.api';

@Controller('data-marts/:dataMartId/insights')
@ApiTags('Insights')
export class InsightController {
  constructor(
    private readonly createInsightService: CreateInsightService,
    private readonly createInsightWithAiService: CreateInsightWithAiService,
    private readonly getInsightService: GetInsightService,
    private readonly listInsightsService: ListInsightsService,
    private readonly updateInsightService: UpdateInsightService,
    private readonly deleteInsightService: DeleteInsightService,
    private readonly updateInsightTitleService: UpdateInsightTitleService,
    private readonly mapper: InsightMapper,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  private async checkDataMartAccess(
    dataMartId: string,
    context: AuthorizationContext,
    action: Action
  ): Promise<void> {
    if (!context.userId) return;
    const allowed = await this.accessDecisionService.canAccess(
      context.userId,
      context.roles ?? [],
      EntityType.DATA_MART,
      dataMartId,
      action,
      context.projectId
    );
    if (!allowed) {
      throw new ForbiddenException('You do not have access to this DataMart');
    }
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Post()
  @CreateInsightSpec()
  async create(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Body() dto: CreateInsightRequestApiDto
  ): Promise<InsightResponseApiDto> {
    await this.checkDataMartAccess(dataMartId, context, Action.EDIT);
    const command = this.mapper.toCreateDomainCommand(dataMartId, context, dto);
    const insight = await this.createInsightService.run(command);
    return this.mapper.toResponse(insight);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Post('ai-generate')
  @CreateInsightWithAiSpec()
  async createWithAi(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string
  ): Promise<InsightResponseApiDto> {
    await this.checkDataMartAccess(dataMartId, context, Action.EDIT);
    const command = this.mapper.toCreateWithAiDomainCommand(dataMartId, context);
    const insight = await this.createInsightWithAiService.run(command);
    return this.mapper.toResponse(insight);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  @ListInsightsSpec()
  async list(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string
  ): Promise<{ data: InsightListItemResponseApiDto[] }> {
    await this.checkDataMartAccess(dataMartId, context, Action.SEE);
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
    await this.checkDataMartAccess(dataMartId, context, Action.SEE);
    const command = this.mapper.toGetCommand(insightId, dataMartId, context);
    const insight = await this.getInsightService.run(command);

    return this.mapper.toResponse(insight);
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
    await this.checkDataMartAccess(dataMartId, context, Action.EDIT);
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
    await this.checkDataMartAccess(dataMartId, context, Action.EDIT);
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
    await this.checkDataMartAccess(dataMartId, context, Action.EDIT);
    const command = this.mapper.toDeleteCommand(insightId, dataMartId, context);
    await this.deleteInsightService.run(command);
  }
}
