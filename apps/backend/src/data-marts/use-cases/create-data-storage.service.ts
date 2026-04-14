import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { Transactional, runOnTransactionCommit } from 'typeorm-transactional';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { CreateDataStorageCommand } from '../dto/domain/create-data-storage.command';
import { DataStorageDto } from '../dto/domain/data-storage.dto';
import { DataStorage } from '../entities/data-storage.entity';
import { StorageOwner } from '../entities/storage-owner.entity';
import { DataStorageCreatedEvent } from '../events/data-storage-created.event';
import { DataStorageMapper } from '../mappers/data-storage.mapper';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { syncOwners } from '../utils/sync-owners';
import { resolveOwnerUsers } from '../utils/resolve-owner-users';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';

@Injectable()
export class CreateDataStorageService {
  private readonly logger = new Logger(CreateDataStorageService.name);

  constructor(
    @InjectRepository(DataStorage)
    private readonly dataStorageRepository: Repository<DataStorage>,
    @InjectRepository(StorageOwner)
    private readonly storageOwnerRepository: Repository<StorageOwner>,
    private readonly dataStorageMapper: DataStorageMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly idpProjectionsFacade: IdpProjectionsFacade,
    private readonly eventEmitter: EventEmitter2
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
      availableForUse: false,
      availableForMaintenance: false,
    });

    const savedEntity = await this.dataStorageRepository.save(entity);

    runOnTransactionCommit(() => {
      this.eventEmitter.emit(
        'data-storage.created',
        new DataStorageCreatedEvent(savedEntity.id, command.projectId, command.userId)
      );
    });

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
