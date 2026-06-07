import { Injectable } from '@nestjs/common';
import { ListProjectDataMartRunsCommand } from '../dto/domain/list-project-data-mart-runs.command';
import { ProjectDataMartRunDto } from '../dto/domain/project-data-mart-run.dto';
import { RoleScope } from '../enums/role-scope.enum';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { ContextAccessService } from '../services/context/context-access.service';
import { DataMartRunService } from '../services/data-mart-run.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';

@Injectable()
export class ListProjectDataMartRunsService {
  constructor(
    private readonly dataMartRunService: DataMartRunService,
    private readonly contextAccessService: ContextAccessService,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly mapper: DataMartMapper
  ) {}

  async run(command: ListProjectDataMartRunsCommand): Promise<ProjectDataMartRunDto[]> {
    const isAdmin = command.roles.includes('admin');
    const roleScope = isAdmin
      ? RoleScope.ENTIRE_PROJECT
      : await this.contextAccessService.getRoleScope(command.userId, command.projectId);

    const runs = await this.dataMartRunService.listVisibleByProject({
      projectId: command.projectId,
      userId: command.userId,
      roles: command.roles,
      roleScope,
      limit: command.limit,
      offset: command.offset,
    });

    const userProjections =
      await this.userProjectionsFetcherService.fetchRelevantUserProjections(runs);

    return runs.map(run => {
      const createdByUser = run.createdById
        ? (userProjections.getByUserId(run.createdById) ?? null)
        : null;

      return new ProjectDataMartRunDto(this.mapper.toDataMartRunDto(run, createdByUser), {
        id: run.dataMart.id,
        title: run.dataMart.title,
      });
    });
  }
}
