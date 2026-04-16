import { Injectable, ForbiddenException } from '@nestjs/common';
import { DataMartRunDto } from '../dto/domain/data-mart-run.dto';
import { GetDataMartRunsCommand } from '../dto/domain/get-data-mart-runs.command';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartRunService } from '../services/data-mart-run.service';
import { DataMartService } from '../services/data-mart.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';

@Injectable()
export class ListDataMartRunsService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly dataMartRunService: DataMartRunService,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly mapper: DataMartMapper,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(command: GetDataMartRunsCommand): Promise<DataMartRunDto[]> {
    await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

    if (command.userId) {
      const canSee = await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.DATA_MART,
        command.id,
        Action.SEE,
        command.projectId
      );
      if (!canSee) {
        throw new ForbiddenException('You do not have access to this DataMart');
      }
    }

    const runs = await this.dataMartRunService.listByDataMartId(
      command.id,
      command.limit,
      command.offset
    );

    const userProjections =
      await this.userProjectionsFetcherService.fetchRelevantUserProjections(runs);

    return this.mapper.toDataMartRunDtoList(runs, userProjections);
  }
}
