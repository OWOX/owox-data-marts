import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { UpdateDataMartOwnersCommand } from '../dto/domain/update-data-mart-owners.command';
import { DataMartBusinessOwner } from '../entities/data-mart-business-owner.entity';
import { DataMartTechnicalOwner } from '../entities/data-mart-technical-owner.entity';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartService } from '../services/data-mart.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { resolveOwnerUsers } from '../utils/resolve-owner-users';

@Injectable()
export class UpdateDataMartOwnersService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly mapper: DataMartMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly idpProjectionsFacade: IdpProjectionsFacade,
    @InjectRepository(DataMartBusinessOwner)
    private readonly businessOwnerRepository: Repository<DataMartBusinessOwner>,
    @InjectRepository(DataMartTechnicalOwner)
    private readonly technicalOwnerRepository: Repository<DataMartTechnicalOwner>
  ) {}

  async run(command: UpdateDataMartOwnersCommand): Promise<DataMartDto> {
    await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

    const allOwnerIds = [...new Set([...command.businessOwnerIds, ...command.technicalOwnerIds])];

    if (allOwnerIds.length > 0) {
      const members = await this.idpProjectionsFacade.getProjectMembers(command.projectId);
      const memberIds = new Set(members.filter(m => !m.isOutbound).map(m => m.userId));

      const invalidIds = allOwnerIds.filter(id => !memberIds.has(id));
      if (invalidIds.length > 0) {
        throw new BadRequestException(
          `The following user IDs are not members of this project: ${invalidIds.join(', ')}`
        );
      }
    }

    await Promise.all([
      this.businessOwnerRepository.delete({ dataMartId: command.id }),
      this.technicalOwnerRepository.delete({ dataMartId: command.id }),
    ]);

    const uniqueBusinessIds = [...new Set(command.businessOwnerIds)];
    const uniqueTechnicalIds = [...new Set(command.technicalOwnerIds)];

    const businessOwners = uniqueBusinessIds.map(userId => {
      const owner = new DataMartBusinessOwner();
      owner.dataMartId = command.id;
      owner.userId = userId;
      return owner;
    });

    const technicalOwners = uniqueTechnicalIds.map(userId => {
      const owner = new DataMartTechnicalOwner();
      owner.dataMartId = command.id;
      owner.userId = userId;
      return owner;
    });

    await Promise.all([
      this.businessOwnerRepository.save(businessOwners),
      this.technicalOwnerRepository.save(technicalOwners),
    ]);

    // Reload data mart with fresh owner relations
    const dataMart = await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

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
