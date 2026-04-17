import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DataMartRunDto } from '../dto/domain/data-mart-run.dto';
import { GetDataMartRunCommand } from '../dto/domain/get-data-mart-run.command';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartRunService } from '../services/data-mart-run.service';
import { DataMartService } from '../services/data-mart.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';

@Injectable()
export class GetDataMartRunService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly dataMartRunService: DataMartRunService,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly mapper: DataMartMapper,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(command: GetDataMartRunCommand): Promise<DataMartRunDto> {
    await this.dataMartService.getByIdAndProjectId(command.dataMartId, command.projectId);

    if (command.userId) {
      const canSee = await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.DATA_MART,
        command.dataMartId,
        Action.SEE,
        command.projectId
      );
      if (!canSee) {
        throw new ForbiddenException('You do not have access to this DataMart');
      }
    }

    const run = await this.dataMartRunService.getByIdAndDataMartId(
      command.runId,
      command.dataMartId
    );
    if (!run) {
      throw new NotFoundException('Run not found');
    }

    const createdByUser = await this.userProjectionsFetcherService.fetchCreatedByUser(run);

    return this.mapper.toDataMartRunDto(run, createdByUser);
  }
}
