import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, AuthorizationContext, Role, Strategy } from '../../idp';
import { CreateInsightArtifactRequestApiDto } from '../dto/presentation/create-insight-artifact-request-api.dto';
import { InsightArtifactListItemResponseApiDto } from '../dto/presentation/insight-artifact-list-item-response-api.dto';
import { InsightArtifactResponseApiDto } from '../dto/presentation/insight-artifact-response-api.dto';
import { UpdateInsightArtifactRequestApiDto } from '../dto/presentation/update-insight-artifact-request-api.dto';
import { UpdateInsightArtifactTitleApiDto } from '../dto/presentation/update-insight-artifact-title-api.dto';
import { InsightArtifactMapper } from '../mappers/insight-artifact.mapper';
import { CreateInsightArtifactService } from '../use-cases/create-insight-artifact.service';
import { DeleteInsightArtifactService } from '../use-cases/delete-insight-artifact.service';
import { GetInsightArtifactService } from '../use-cases/get-insight-artifact.service';
import { ListInsightArtifactsService } from '../use-cases/list-insight-artifacts.service';
import { UpdateInsightArtifactService } from '../use-cases/update-insight-artifact.service';
import { UpdateInsightArtifactTitleService } from '../use-cases/update-insight-artifact-title.service';
import {
  CreateInsightArtifactSpec,
  DeleteInsightArtifactSpec,
  GetInsightArtifactSpec,
  ListInsightArtifactsSpec,
  UpdateInsightArtifactSpec,
  UpdateInsightArtifactTitleSpec,
} from './spec/insight-artifact.api';

@Controller('data-marts/:dataMartId/insight-artifacts')
@ApiTags('Insights')
export class InsightArtifactController {
  constructor(
    private readonly createInsightArtifactService: CreateInsightArtifactService,
    private readonly getInsightArtifactService: GetInsightArtifactService,
    private readonly listInsightArtifactsService: ListInsightArtifactsService,
    private readonly updateInsightArtifactService: UpdateInsightArtifactService,
    private readonly deleteInsightArtifactService: DeleteInsightArtifactService,
    private readonly updateInsightArtifactTitleService: UpdateInsightArtifactTitleService,
    private readonly mapper: InsightArtifactMapper
  ) {}

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Post()
  @CreateInsightArtifactSpec()
  async create(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Body() dto: CreateInsightArtifactRequestApiDto
  ): Promise<InsightArtifactResponseApiDto> {
    const command = this.mapper.toCreateDomainCommand(dataMartId, context, dto);
    const artifact = await this.createInsightArtifactService.run(command);
    return this.mapper.toResponse(artifact);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  @ListInsightArtifactsSpec()
  async list(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string
  ): Promise<{ data: InsightArtifactListItemResponseApiDto[] }> {
    const command = this.mapper.toListCommand(dataMartId, context);
    const artifacts = await this.listInsightArtifactsService.run(command);

    return { data: this.mapper.toListItemResponseList(artifacts) };
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get(':insightArtifactId')
  @GetInsightArtifactSpec()
  async get(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('insightArtifactId') insightArtifactId: string
  ): Promise<InsightArtifactResponseApiDto> {
    const command = this.mapper.toGetCommand(insightArtifactId, dataMartId, context);
    const artifact = await this.getInsightArtifactService.run(command);

    return this.mapper.toResponse(artifact);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Put(':insightArtifactId')
  @UpdateInsightArtifactSpec()
  async update(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('insightArtifactId') insightArtifactId: string,
    @Body() dto: UpdateInsightArtifactRequestApiDto
  ): Promise<InsightArtifactResponseApiDto> {
    const command = this.mapper.toUpdateCommand(insightArtifactId, dataMartId, context, dto);
    const artifact = await this.updateInsightArtifactService.run(command);

    return this.mapper.toResponse(artifact);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Put(':insightArtifactId/title')
  @UpdateInsightArtifactTitleSpec()
  async updateTitle(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('insightArtifactId') insightArtifactId: string,
    @Body() dto: UpdateInsightArtifactTitleApiDto
  ): Promise<InsightArtifactResponseApiDto> {
    const command = this.mapper.toUpdateTitleCommand(insightArtifactId, dataMartId, context, dto);
    const artifact = await this.updateInsightArtifactTitleService.run(command);

    return this.mapper.toResponse(artifact);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Delete(':insightArtifactId')
  @DeleteInsightArtifactSpec()
  @HttpCode(204)
  async delete(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('insightArtifactId') insightArtifactId: string
  ): Promise<void> {
    const command = this.mapper.toDeleteCommand(insightArtifactId, dataMartId, context);
    await this.deleteInsightArtifactService.run(command);
  }
}
