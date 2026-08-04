import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, AuthorizationContext, Role, Strategy } from '../../idp';
import { ListProjectDataMartRunsCommand } from '../dto/domain/list-project-data-mart-runs.command';
import { ProjectDataMartRunsResponseApiDto } from '../dto/presentation/project-data-mart-runs-response-api.dto';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { ListProjectDataMartRunsService } from '../use-cases/list-project-data-mart-runs.service';
import { normalizeProjectListPagination } from '../utils/normalize-project-list-pagination';
import { GetProjectDataMartRunsSpec } from './spec/project-data-mart-runs.api';

@Controller('data-marts/runs')
@ApiTags('Run History')
export class ProjectDataMartRunsController {
  constructor(
    private readonly listProjectDataMartRunsService: ListProjectDataMartRunsService,
    private readonly mapper: DataMartMapper
  ) {}

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  @GetProjectDataMartRunsSpec()
  async list(
    @AuthContext() context: AuthorizationContext,
    @Query('limit') limit?: string | number,
    @Query('offset') offset?: string | number
  ): Promise<ProjectDataMartRunsResponseApiDto> {
    const pagination = normalizeProjectListPagination(limit, offset);
    const command = new ListProjectDataMartRunsCommand(
      context.projectId,
      pagination.limit,
      pagination.offset,
      context.userId,
      context.roles ?? []
    );
    const runs = await this.listProjectDataMartRunsService.run(command);
    return this.mapper.toProjectRunsResponse(runs);
  }
}
