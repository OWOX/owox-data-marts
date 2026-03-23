import { BadRequestException, Injectable } from '@nestjs/common';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
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
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly idpProjectionsFacade: IdpProjectionsFacade
  ) {}

  async run(command: UpdateDataMartOwnersCommand): Promise<DataMartDto> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

    // Validate that all provided owner IDs belong to project members
    const allOwnerIds = [...new Set([...command.businessOwnerIds, ...command.technicalOwnerIds])];

    if (allOwnerIds.length > 0) {
      const members = await this.idpProjectionsFacade.getProjectMembers(command.projectId);
      const memberIds = new Set(members.map(m => m.userId));

      const invalidIds = allOwnerIds.filter(id => !memberIds.has(id));
      if (invalidIds.length > 0) {
        throw new BadRequestException(
          `The following user IDs are not members of this project: ${invalidIds.join(', ')}`
        );
      }
    }

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
