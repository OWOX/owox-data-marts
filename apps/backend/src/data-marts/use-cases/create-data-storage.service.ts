import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { CreateDataStorageCommand } from '../dto/domain/create-data-storage.command';
import { DataStorageDto } from '../dto/domain/data-storage.dto';
import { DataStorage } from '../entities/data-storage.entity';
import { StorageOwner } from '../entities/storage-owner.entity';
import { DataStorageMapper } from '../mappers/data-storage.mapper';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { syncOwners } from '../utils/sync-owners';
import { resolveOwnerUsers } from '../utils/resolve-owner-users';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';

@Injectable()
export class CreateDataStorageService {
  constructor(
    @InjectRepository(DataStorage)
    private readonly dataStorageRepository: Repository<DataStorage>,
    @InjectRepository(StorageOwner)
    private readonly storageOwnerRepository: Repository<StorageOwner>,
    private readonly dataStorageMapper: DataStorageMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly idpProjectionsFacade: IdpProjectionsFacade
  ) {}

  @Transactional()
  async run(command: CreateDataStorageCommand): Promise<DataStorageDto> {
    if (command.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY) {
      throw new BusinessViolationException(
        "Legacy Google BigQuery storage can't be created manually."
      );
    }

    const entity = this.dataStorageRepository.create({
      type: command.type,
      projectId: command.projectId,
      createdById: command.userId,
      sharedForUse: false,
      sharedForMaintenance: false,
    });

    const savedEntity = await this.dataStorageRepository.save(entity);

    const ownerIdsToSave = command.ownerIds ?? [command.userId];
    await syncOwners(
      this.storageOwnerRepository,
      'storageId',
      savedEntity.id,
      command.projectId,
      ownerIdsToSave,
      this.idpProjectionsFacade,
      userId => {
        const o = new StorageOwner();
        o.storageId = savedEntity.id;
        o.userId = userId;
        return o;
      }
    );

    savedEntity.owners = ownerIdsToSave.map(uid => {
      const o = new StorageOwner();
      o.storageId = savedEntity.id;
      o.userId = uid;
      return o;
    });
    const allUserIds = [command.userId, ...ownerIdsToSave];
    const userProjections =
      await this.userProjectionsFetcherService.fetchUserProjectionsList(allUserIds);
    const createdByUser = userProjections.getByUserId(command.userId) ?? null;
    return this.dataStorageMapper.toDomainDto(
      savedEntity,
      0,
      0,
      createdByUser,
      resolveOwnerUsers(ownerIdsToSave, userProjections)
    );
  }
}
