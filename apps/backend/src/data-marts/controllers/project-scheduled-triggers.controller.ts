import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, AuthorizationContext, Role, Strategy } from '../../idp';
import { ListProjectScheduledTriggersCommand } from '../dto/domain/list-project-scheduled-triggers.command';
import { ProjectScheduledTriggersResponseApiDto } from '../dto/presentation/project-scheduled-triggers-response-api.dto';
import { ScheduledTriggerMapper } from '../mappers/scheduled-trigger.mapper';
import { ListProjectScheduledTriggersService } from '../use-cases/list-project-scheduled-triggers.service';
import { normalizeProjectListPagination } from '../utils/normalize-project-list-pagination';
import { ListProjectScheduledTriggersSpec } from './spec/project-scheduled-triggers.api';

@Controller('data-marts/scheduled-triggers')
@ApiTags('ScheduledTriggers')
export class ProjectScheduledTriggersController {
  constructor(
    private readonly listProjectScheduledTriggersService: ListProjectScheduledTriggersService,
    private readonly mapper: ScheduledTriggerMapper
  ) {}

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  @ListProjectScheduledTriggersSpec()
  async list(
    @AuthContext() context: AuthorizationContext,
    @Query('limit') limit?: string | number,
    @Query('offset') offset?: string | number
  ): Promise<ProjectScheduledTriggersResponseApiDto> {
    const pagination = normalizeProjectListPagination(limit, offset);
    const command = new ListProjectScheduledTriggersCommand(
      context.projectId,
      pagination.limit,
      pagination.offset,
      context.userId,
      context.roles ?? []
    );
    const triggers = await this.listProjectScheduledTriggersService.run(command);
    return this.mapper.toProjectResponseList(triggers);
  }
}
