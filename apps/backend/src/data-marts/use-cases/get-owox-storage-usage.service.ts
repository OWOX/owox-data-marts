import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { GetOwoxStorageUsageCommand } from '../dto/domain/get-owox-storage-usage.command';
import { describeGoogleError } from '../owox-storage/engine/bigquery-managed-storage.engine';
import { ManagedStorageService } from '../owox-storage/managed-storage.service';
import {
  OwoxStorageUsage,
  OwoxStorageUsageService,
} from '../owox-storage/owox-storage-usage.service';
import { OwoxStorageUsageReadException } from '../owox-storage/owox-storage.exceptions';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { DataStorageService } from '../services/data-storage.service';

@Injectable()
export class GetOwoxStorageUsageService {
  private readonly logger = new Logger(GetOwoxStorageUsageService.name);

  constructor(
    private readonly dataStorageService: DataStorageService,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly managedStorages: ManagedStorageService,
    private readonly usageService: OwoxStorageUsageService
  ) {}

  async run(command: GetOwoxStorageUsageCommand): Promise<OwoxStorageUsage> {
    await this.dataStorageService.getByProjectIdAndId(command.projectId, command.storageId);

    if (command.userId) {
      const canSee = await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.STORAGE,
        command.storageId,
        Action.SEE,
        command.projectId
      );
      if (!canSee) {
        throw new ForbiddenException('You do not have access to this Storage');
      }
    }

    const record = await this.managedStorages.findByStorageId(command.storageId);
    if (!record) {
      throw new BusinessViolationException('This storage is not an OWOX Storage.');
    }

    try {
      return await this.usageService.getUsage(record);
    } catch (error) {
      this.logger.error(
        `OWOX Storage ${record.datasetId} usage read failed${describeGoogleError(error)}`
      );
      throw new OwoxStorageUsageReadException();
    }
  }
}
