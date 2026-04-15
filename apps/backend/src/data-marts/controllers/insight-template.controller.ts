import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, AuthorizationContext, Role, Strategy } from '../../idp';
import { CreateInsightTemplateRequestApiDto } from '../dto/presentation/create-insight-template-request-api.dto';
import { CreateInsightTemplateSourceRequestApiDto } from '../dto/presentation/create-insight-template-source-request-api.dto';
import { InsightTemplateListItemResponseApiDto } from '../dto/presentation/insight-template-list-item-response-api.dto';
import { InsightTemplateResponseApiDto } from '../dto/presentation/insight-template-response-api.dto';
import { InsightTemplateSourceDetailsApiDto } from '../dto/presentation/insight-template-source-details-api.dto';
import { UpdateInsightTemplateRequestApiDto } from '../dto/presentation/update-insight-template-request-api.dto';
import { UpdateInsightTemplateSourceRequestApiDto } from '../dto/presentation/update-insight-template-source-request-api.dto';
import { UpdateInsightTemplateTitleApiDto } from '../dto/presentation/update-insight-template-title-api.dto';
import { InsightTemplateMapper } from '../mappers/insight-template.mapper';
import { InsightTemplateSourceMapper } from '../mappers/insight-template-source.mapper';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';
import { CreateInsightTemplateSourceService } from '../use-cases/create-insight-template-source.service';
import { CreateInsightTemplateService } from '../use-cases/create-insight-template.service';
import { DeleteInsightTemplateSourceService } from '../use-cases/delete-insight-template-source.service';
import { DeleteInsightTemplateService } from '../use-cases/delete-insight-template.service';
import { GetInsightTemplateService } from '../use-cases/get-insight-template.service';
import { ListInsightTemplateSourcesService } from '../use-cases/list-insight-template-sources.service';
import { ListInsightTemplatesService } from '../use-cases/list-insight-templates.service';
import { UpdateInsightTemplateSourceService } from '../use-cases/update-insight-template-source.service';
import { UpdateInsightTemplateService } from '../use-cases/update-insight-template.service';
import { UpdateInsightTemplateTitleService } from '../use-cases/update-insight-template-title.service';
import {
  CreateInsightTemplateSourceSpec,
  CreateInsightTemplateSpec,
  DeleteInsightTemplateSourceSpec,
  DeleteInsightTemplateSpec,
  ListInsightTemplateSourcesSpec,
  GetInsightTemplateSpec,
  ListInsightTemplatesSpec,
  UpdateInsightTemplateSourceSpec,
  UpdateInsightTemplateSpec,
  UpdateInsightTemplateTitleSpec,
} from './spec/insight-template.api';

@Controller('data-marts/:dataMartId/insight-templates')
@ApiTags('Insights')
export class InsightTemplateController {
  constructor(
    private readonly createInsightTemplateService: CreateInsightTemplateService,
    private readonly getInsightTemplateService: GetInsightTemplateService,
    private readonly listInsightTemplatesService: ListInsightTemplatesService,
    private readonly updateInsightTemplateService: UpdateInsightTemplateService,
    private readonly deleteInsightTemplateService: DeleteInsightTemplateService,
    private readonly listInsightTemplateSourcesService: ListInsightTemplateSourcesService,
    private readonly createInsightTemplateSourceService: CreateInsightTemplateSourceService,
    private readonly updateInsightTemplateSourceService: UpdateInsightTemplateSourceService,
    private readonly deleteInsightTemplateSourceService: DeleteInsightTemplateSourceService,
    private readonly updateInsightTemplateTitleService: UpdateInsightTemplateTitleService,
    private readonly mapper: InsightTemplateMapper,
    private readonly sourceMapper: InsightTemplateSourceMapper,
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
  @CreateInsightTemplateSpec()
  async create(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Body() dto: CreateInsightTemplateRequestApiDto
  ): Promise<InsightTemplateResponseApiDto> {
    await this.checkDataMartAccess(dataMartId, context, Action.EDIT);
    const command = this.mapper.toCreateDomainCommand(dataMartId, context, dto);
    const insightTemplate = await this.createInsightTemplateService.run(command);
    return this.mapper.toResponse(insightTemplate);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  @ListInsightTemplatesSpec()
  async list(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string
  ): Promise<{ data: InsightTemplateListItemResponseApiDto[] }> {
    await this.checkDataMartAccess(dataMartId, context, Action.SEE);
    const command = this.mapper.toListCommand(dataMartId, context);
    const insightTemplates = await this.listInsightTemplatesService.run(command);

    return { data: this.mapper.toListItemResponseList(insightTemplates) };
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get(':insightTemplateId')
  @GetInsightTemplateSpec()
  async get(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('insightTemplateId') insightTemplateId: string
  ): Promise<InsightTemplateResponseApiDto> {
    await this.checkDataMartAccess(dataMartId, context, Action.SEE);
    const command = this.mapper.toGetCommand(insightTemplateId, dataMartId, context);
    const insightTemplate = await this.getInsightTemplateService.run(command);

    return this.mapper.toResponse(insightTemplate);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Put(':insightTemplateId')
  @UpdateInsightTemplateSpec()
  async update(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('insightTemplateId') insightTemplateId: string,
    @Body() dto: UpdateInsightTemplateRequestApiDto
  ): Promise<InsightTemplateResponseApiDto> {
    await this.checkDataMartAccess(dataMartId, context, Action.EDIT);
    const command = this.mapper.toUpdateCommand(insightTemplateId, dataMartId, context, dto);
    const insightTemplate = await this.updateInsightTemplateService.run(command);
    return this.mapper.toResponse(insightTemplate);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Put(':insightTemplateId/title')
  @UpdateInsightTemplateTitleSpec()
  async updateTitle(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('insightTemplateId') insightTemplateId: string,
    @Body() dto: UpdateInsightTemplateTitleApiDto
  ): Promise<InsightTemplateResponseApiDto> {
    await this.checkDataMartAccess(dataMartId, context, Action.EDIT);
    const command = this.mapper.toUpdateTitleCommand(insightTemplateId, dataMartId, context, dto);
    const insightTemplate = await this.updateInsightTemplateTitleService.run(command);
    return this.mapper.toResponse(insightTemplate);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Delete(':insightTemplateId')
  @DeleteInsightTemplateSpec()
  @HttpCode(204)
  async delete(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('insightTemplateId') insightTemplateId: string
  ): Promise<void> {
    await this.checkDataMartAccess(dataMartId, context, Action.EDIT);
    const command = this.mapper.toDeleteCommand(insightTemplateId, dataMartId, context);
    await this.deleteInsightTemplateService.run(command);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Delete(':insightTemplateId/sources/:sourceId')
  @DeleteInsightTemplateSourceSpec()
  @HttpCode(204)
  async deleteSource(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('insightTemplateId') insightTemplateId: string,
    @Param('sourceId') sourceId: string
  ): Promise<void> {
    await this.checkDataMartAccess(dataMartId, context, Action.EDIT);
    const command = this.sourceMapper.toDeleteCommand(
      sourceId,
      insightTemplateId,
      dataMartId,
      context
    );
    await this.deleteInsightTemplateSourceService.run(command);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get(':insightTemplateId/sources')
  @ListInsightTemplateSourcesSpec()
  async listSources(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('insightTemplateId') insightTemplateId: string
  ): Promise<{ data: InsightTemplateSourceDetailsApiDto[] }> {
    await this.checkDataMartAccess(dataMartId, context, Action.SEE);
    const command = this.sourceMapper.toListCommand(insightTemplateId, dataMartId, context);
    const sources = await this.listInsightTemplateSourcesService.run(command);

    return { data: this.sourceMapper.toResponseList(sources) };
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Post(':insightTemplateId/sources')
  @CreateInsightTemplateSourceSpec()
  async createSource(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('insightTemplateId') insightTemplateId: string,
    @Body() dto: CreateInsightTemplateSourceRequestApiDto
  ): Promise<InsightTemplateSourceDetailsApiDto> {
    await this.checkDataMartAccess(dataMartId, context, Action.EDIT);
    const command = this.sourceMapper.toCreateCommand(insightTemplateId, dataMartId, context, dto);
    const source = await this.createInsightTemplateSourceService.run(command);

    return this.sourceMapper.toResponse(source);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Patch(':insightTemplateId/sources/:sourceId')
  @UpdateInsightTemplateSourceSpec()
  async updateSource(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('insightTemplateId') insightTemplateId: string,
    @Param('sourceId') sourceId: string,
    @Body() dto: UpdateInsightTemplateSourceRequestApiDto
  ): Promise<InsightTemplateSourceDetailsApiDto> {
    await this.checkDataMartAccess(dataMartId, context, Action.EDIT);
    const command = this.sourceMapper.toUpdateCommand(
      sourceId,
      insightTemplateId,
      dataMartId,
      context,
      dto
    );
    const source = await this.updateInsightTemplateSourceService.run(command);

    return this.sourceMapper.toResponse(source);
  }
}
