import { Injectable, ForbiddenException, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DeleteDataStorageCommand } from '../dto/domain/delete-data-storage.command';
import { DataStorage } from '../entities/data-storage.entity';
import { DataMartService } from '../services/data-mart.service';
import { DataStorageService } from '../services/data-storage.service';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';
import { AdvancedSearchIndexSyncService } from '../services/advanced-search-index-sync.service';
import { SearchableEntityType } from '../../common/search/search.facade';
import { StorageCredentialBindingService } from '../data-storage-types/storage-credential-binding.service';
import { ManagedStorageService } from '../owox-storage/managed-storage.service';
import {
  MANAGED_STORAGE_ENGINE,
  ManagedStorageEngine,
} from '../owox-storage/engine/managed-storage-engine';
import { describeGoogleError } from '../owox-storage/engine/bigquery-managed-storage.engine';

@Injectable()
export class DeleteDataStorageService {
  constructor(
    @InjectRepository(DataStorage)
    private readonly dataStorageRepository: Repository<DataStorage>,
    private readonly dataStorageService: DataStorageService,
    private readonly dataMartService: DataMartService,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly storageCredentials: StorageCredentialBindingService,
    private readonly managedStorages: ManagedStorageService,
    @Inject(MANAGED_STORAGE_ENGINE) private readonly engine: ManagedStorageEngine,
    private readonly advancedSearchIndexSync?: AdvancedSearchIndexSyncService
  ) {}

  private readonly logger = new Logger(DeleteDataStorageService.name);

  async run(command: DeleteDataStorageCommand): Promise<void> {
    const dataStorage = await this.dataStorageService.getByProjectIdAndId(
      command.projectId,
      command.id
    );

    if (command.userId) {
      const canDelete = await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.STORAGE,
        command.id,
        Action.DELETE,
        command.projectId
      );
      if (!canDelete) {
        throw new ForbiddenException('You do not have permission to delete this Storage');
      }
    }

    if (dataStorage.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY) {
      throw new BusinessViolationException(
        "Legacy Google BigQuery storage can't be deleted manually."
      );
    }

    const dataMartsForStorage = await this.dataMartService.findByStorage(dataStorage);

    if (dataMartsForStorage.length > 0) {
      throw new BusinessViolationException(
        'Cannot delete the storage because it is referenced by existing data marts.',
        { referencedDataMarts: dataMartsForStorage.map(mart => mart.id) }
      );
    }

    const managed = await this.managedStorages.findByStorageId(command.id);
    if (managed) {
      // An already deleted record keeps its date.
      await this.managedStorages.markDeleting(managed.storageId, new Date());
      try {
        await this.engine.deprovision(managed);
      } catch (error) {
        this.logger.error(
          `OWOX Storage ${managed.datasetId} deprovision failed on delete${describeGoogleError(error)}`
        );
        await this.managedStorages.setDeprovisionPending(managed.storageId, true);
        throw new BusinessViolationException('OWOX Storage could not be deleted. Try again later.');
      }
    }

    await this.softDelete(command, managed !== null);
  }

  @Transactional()
  private async softDelete(command: DeleteDataStorageCommand, managed: boolean): Promise<void> {
    await this.dataStorageRepository.softDelete({
      id: command.id,
      projectId: command.projectId,
    });
    await this.storageCredentials.deactivateStorage(command.id);
    await this.advancedSearchIndexSync?.scheduleDelete(
      SearchableEntityType.DATA_STORAGE,
      command.id,
      command.projectId
    );
    if (managed) await this.managedStorages.remove(command.id);
  }
}
