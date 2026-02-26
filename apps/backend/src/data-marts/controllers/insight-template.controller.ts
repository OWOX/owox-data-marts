import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, AuthorizationContext, Role, Strategy } from '../../idp';
import { CreateInsightTemplateRequestApiDto } from '../dto/presentation/create-insight-template-request-api.dto';
import { InsightTemplateListItemResponseApiDto } from '../dto/presentation/insight-template-list-item-response-api.dto';
import { InsightTemplateResponseApiDto } from '../dto/presentation/insight-template-response-api.dto';
import { UpdateInsightTemplateRequestApiDto } from '../dto/presentation/update-insight-template-request-api.dto';
import { UpdateInsightTemplateTitleApiDto } from '../dto/presentation/update-insight-template-title-api.dto';
import { InsightTemplateMapper } from '../mappers/insight-template.mapper';
import { CreateInsightTemplateService } from '../use-cases/create-insight-template.service';
import { DeleteInsightTemplateService } from '../use-cases/delete-insight-template.service';
import { GetInsightTemplateService } from '../use-cases/get-insight-template.service';
import { ListInsightTemplatesService } from '../use-cases/list-insight-templates.service';
import { UpdateInsightTemplateService } from '../use-cases/update-insight-template.service';
import { UpdateInsightTemplateTitleService } from '../use-cases/update-insight-template-title.service';
import {
  CreateInsightTemplateSpec,
  DeleteInsightTemplateSpec,
  GetInsightTemplateSpec,
  ListInsightTemplatesSpec,
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
    private readonly updateInsightTemplateTitleService: UpdateInsightTemplateTitleService,
    private readonly mapper: InsightTemplateMapper
  ) {}

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Post()
  @CreateInsightTemplateSpec()
  async create(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Body() dto: CreateInsightTemplateRequestApiDto
  ): Promise<InsightTemplateResponseApiDto> {
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
    const command = this.mapper.toDeleteCommand(insightTemplateId, dataMartId, context);
    await this.deleteInsightTemplateService.run(command);
  }
}
