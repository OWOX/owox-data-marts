import { Injectable, ForbiddenException } from '@nestjs/common';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { GetDataMartCommand } from '../dto/domain/get-data-mart.command';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartService } from '../services/data-mart.service';
import { LegacyDataMartsService } from '../services/legacy-data-marts/legacy-data-marts.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { SyncLegacyDataMartService } from './legacy-data-marts/sync-legacy-data-mart.service';
import { resolveOwnerUsers } from '../utils/resolve-owner-users';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';

@Injectable()
export class GetDataMartService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly mapper: DataMartMapper,
    private readonly legacyDataMartService: LegacyDataMartsService,
    private readonly syncLegacyDataMartService: SyncLegacyDataMartService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(command: GetDataMartCommand): Promise<DataMartDto> {
    if (this.legacyDataMartService.isDataMartIdLooksLikeLegacy(command.id)) {
      await this.syncLegacyDataMartService.run({ dataMartId: command.id });
    }

    const dataMart = await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

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

    const userProjections =
      await this.userProjectionsFetcherService.fetchAllRelevantUserProjections([dataMart]);

    return this.mapper.toDomainDto(
      dataMart,
      undefined,
      userProjections.getByUserId(dataMart.createdById),
      resolveOwnerUsers(dataMart.businessOwnerIds, userProjections),
      resolveOwnerUsers(dataMart.technicalOwnerIds, userProjections)
    );
  }
}
