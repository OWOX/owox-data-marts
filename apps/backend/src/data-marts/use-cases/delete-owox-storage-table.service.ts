import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DeleteOwoxStorageTableCommand } from '../dto/domain/delete-owox-storage-table.command';
import { describeGoogleError } from '../owox-storage/engine/bigquery-managed-storage.engine';
import {
  MANAGED_STORAGE_ENGINE,
  ManagedStorageEngine,
} from '../owox-storage/engine/managed-storage-engine';
import { ManagedStorageService } from '../owox-storage/managed-storage.service';
import { OwoxStorageTableDeleteException } from '../owox-storage/owox-storage.exceptions';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { DataStorageService } from '../services/data-storage.service';

@Injectable()
export class DeleteOwoxStorageTableService {
  private readonly logger = new Logger(DeleteOwoxStorageTableService.name);

  constructor(
    private readonly dataStorageService: DataStorageService,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly managedStorages: ManagedStorageService,
    @Inject(MANAGED_STORAGE_ENGINE) private readonly engine: ManagedStorageEngine
  ) {}

  async run(command: DeleteOwoxStorageTableCommand): Promise<void> {
    if (command.fromPlugin) {
      throw new ForbiddenException('Plugins cannot delete OWOX Storage tables.');
    }

    await this.dataStorageService.getByProjectIdAndId(command.projectId, command.storageId);

    if (command.userId) {
      const canEdit = await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.STORAGE,
        command.storageId,
        Action.EDIT,
        command.projectId
      );
      if (!canEdit) {
        throw new ForbiddenException('You do not have permission to edit this Storage');
      }
    }

    const record = await this.managedStorages.findByStorageId(command.storageId);
    if (!record) {
      throw new BusinessViolationException('This storage is not an OWOX Storage.');
    }
    if (record.deprovisionedAt) {
      throw new BusinessViolationException(
        'This OWOX Storage and its data were deleted. Restore the storage on its page to continue.'
      );
    }

    try {
      await this.engine.dropTable(record, command.tableName);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(
        `OWOX Storage ${record.datasetId} table delete failed${describeGoogleError(error)}`
      );
      throw new OwoxStorageTableDeleteException();
    }
  }
}
