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

@Injectable()
export class CreateDataStorageService {
  constructor(
    @InjectRepository(DataStorage)
    private readonly dataStorageRepository: Repository<DataStorage>,
    @InjectRepository(StorageOwner)
    private readonly storageOwnerRepository: Repository<StorageOwner>,
    private readonly dataStorageMapper: DataStorageMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService
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
    });

    const savedEntity = await this.dataStorageRepository.save(entity);

    const owner = new StorageOwner();
    owner.storageId = savedEntity.id;
    owner.userId = command.userId;
    await this.storageOwnerRepository.save(owner);
    const createdByUser = await this.userProjectionsFetcherService.fetchCreatedByUser(savedEntity);
    const ownerUsers = createdByUser ? [createdByUser] : [];
    return this.dataStorageMapper.toDomainDto(savedEntity, 0, 0, createdByUser, ownerUsers);
  }
}
