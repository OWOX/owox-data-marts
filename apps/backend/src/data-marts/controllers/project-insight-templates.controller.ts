import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, AuthorizationContext, Role, Strategy } from '../../idp';
import { ListProjectInsightTemplatesCommand } from '../dto/domain/list-project-insight-templates.command';
import { ProjectInsightTemplatesResponseApiDto } from '../dto/presentation/project-insight-templates-response-api.dto';
import { InsightTemplateMapper } from '../mappers/insight-template.mapper';
import { ListProjectInsightTemplatesService } from '../use-cases/list-project-insight-templates.service';
import { normalizeProjectListPagination } from '../utils/normalize-project-list-pagination';
import { ListProjectInsightTemplatesSpec } from './spec/project-insight-templates.api';

@Controller('data-marts/insight-templates')
@ApiTags('Insights')
export class ProjectInsightTemplatesController {
  constructor(
    private readonly listProjectInsightTemplatesService: ListProjectInsightTemplatesService,
    private readonly mapper: InsightTemplateMapper
  ) {}

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  @ListProjectInsightTemplatesSpec()
  async list(
    @AuthContext() context: AuthorizationContext,
    @Query('limit') limit?: string | number,
    @Query('offset') offset?: string | number
  ): Promise<ProjectInsightTemplatesResponseApiDto> {
    const pagination = normalizeProjectListPagination(limit, offset);
    const command = new ListProjectInsightTemplatesCommand(
      context.projectId,
      pagination.limit,
      pagination.offset,
      context.userId,
      context.roles ?? []
    );
    const insightTemplates = await this.listProjectInsightTemplatesService.run(command);
    return this.mapper.toProjectResponseList(insightTemplates);
  }
}
