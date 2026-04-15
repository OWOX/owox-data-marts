import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
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
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';

@Injectable()
export class UpdateDataMartOwnersService {
  private readonly logger = new Logger(UpdateDataMartOwnersService.name);

  constructor(
    private readonly dataMartService: DataMartService,
    private readonly mapper: DataMartMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly idpProjectionsFacade: IdpProjectionsFacade,
    @InjectRepository(DataMartBusinessOwner)
    private readonly businessOwnerRepository: Repository<DataMartBusinessOwner>,
    @InjectRepository(DataMartTechnicalOwner)
    private readonly technicalOwnerRepository: Repository<DataMartTechnicalOwner>,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  @Transactional()
  async run(command: UpdateDataMartOwnersCommand): Promise<DataMartDto> {
    await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

    // Permissions Model: only existing owners or admin can manage owners
    if (command.userId) {
      const canManage = await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.DATA_MART,
        command.id,
        Action.MANAGE_OWNERS,
        command.projectId
      );
      if (!canManage) {
        throw new ForbiddenException('You cannot manage owners of this DataMart');
      }
    }

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
