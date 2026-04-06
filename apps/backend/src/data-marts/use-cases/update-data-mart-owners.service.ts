import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { UpdateDataMartOwnersCommand } from '../dto/domain/update-data-mart-owners.command';
import { DataMartBusinessOwner } from '../entities/data-mart-business-owner.entity';
import { DataMartTechnicalOwner } from '../entities/data-mart-technical-owner.entity';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartService } from '../services/data-mart.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { resolveOwnerUsers } from '../utils/resolve-owner-users';
import { syncOwners } from '../utils/sync-owners';

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

  @Transactional()
  async run(command: UpdateDataMartOwnersCommand): Promise<DataMartDto> {
    await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

    await Promise.all([
      syncOwners(
        this.businessOwnerRepository,
        'dataMartId',
        command.id,
        command.projectId,
        command.businessOwnerIds,
        this.idpProjectionsFacade,
        userId => {
          const owner = new DataMartBusinessOwner();
          owner.dataMartId = command.id;
          owner.userId = userId;
          return owner;
        }
      ),
      syncOwners(
        this.technicalOwnerRepository,
        'dataMartId',
        command.id,
        command.projectId,
        command.technicalOwnerIds,
        this.idpProjectionsFacade,
        userId => {
          const owner = new DataMartTechnicalOwner();
          owner.dataMartId = command.id;
          owner.userId = userId;
          return owner;
        }
      ),
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
