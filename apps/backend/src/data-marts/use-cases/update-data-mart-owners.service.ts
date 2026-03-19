import { Injectable } from '@nestjs/common';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { UpdateDataMartOwnersCommand } from '../dto/domain/update-data-mart-owners.command';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartService } from '../services/data-mart.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';

@Injectable()
export class UpdateDataMartOwnersService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly mapper: DataMartMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService
  ) {}

  async run(command: UpdateDataMartOwnersCommand): Promise<DataMartDto> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

    dataMart.businessOwnerIds = command.businessOwnerIds;
    dataMart.technicalOwnerIds = command.technicalOwnerIds;
    await this.dataMartService.save(dataMart);

    const userProjections =
      await this.userProjectionsFetcherService.fetchAllRelevantUserProjections([dataMart]);

    return this.mapper.toDomainDto(
      dataMart,
      undefined,
      userProjections.getByUserId(dataMart.createdById),
      this.mapper.resolveOwnerUsers(dataMart.businessOwnerIds, userProjections),
      this.mapper.resolveOwnerUsers(dataMart.technicalOwnerIds, userProjections)
    );
  }
}
