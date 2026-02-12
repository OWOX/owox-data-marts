import { Injectable } from '@nestjs/common';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { GetDataMartCommand } from '../dto/domain/get-data-mart.command';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartService } from '../services/data-mart.service';
import { LegacyDataMartsService } from '../services/legacy-data-marts/legacy-data-marts.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { SyncLegacyDataMartService } from './legacy-data-marts/sync-legacy-data-mart.service';

@Injectable()
export class GetDataMartService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly mapper: DataMartMapper,
    private readonly legacyDataMartService: LegacyDataMartsService,
    private readonly syncLegacyDataMartService: SyncLegacyDataMartService
  ) {}

  async run(command: GetDataMartCommand): Promise<DataMartDto> {
    if (this.legacyDataMartService.isDataMartIdLooksLikeLegacy(command.id)) {
      await this.syncLegacyDataMartService.run({ dataMartId: command.id });
    }

    const dataMart = await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

    const userProjection = await this.userProjectionsFetcherService.fetchUserProjection(
      dataMart.createdById
    );

    return this.mapper.toDomainDto(dataMart, undefined, userProjection);
  }
}
