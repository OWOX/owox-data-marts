import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { ConnectorStateService } from '../connector-types/connector-message/services/connector-state.service';
import { RestoreOwoxStorageCommand } from '../dto/domain/restore-owox-storage.command';
import { ManagedStorage } from '../entities/managed-storage.entity';
import { ProjectPlanType } from '../enums/project-plan-type.enum';
import { describeGoogleError } from '../owox-storage/engine/bigquery-managed-storage.engine';
import {
  MANAGED_STORAGE_ENGINE,
  ManagedStorageEngine,
} from '../owox-storage/engine/managed-storage-engine';
import { ManagedStorageService } from '../owox-storage/managed-storage.service';
import { OwoxStorageRestoreException } from '../owox-storage/owox-storage.exceptions';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { DataMartService } from '../services/data-mart.service';
import { DataStorageService } from '../services/data-storage.service';
import { InternalProjectBillingService } from '../services/project-billing/internal-project-billing.service';

@Injectable()
export class RestoreOwoxStorageService {
  private readonly logger = new Logger(RestoreOwoxStorageService.name);

  constructor(
    private readonly dataStorageService: DataStorageService,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly managedStorages: ManagedStorageService,
    @Inject(MANAGED_STORAGE_ENGINE) private readonly engine: ManagedStorageEngine,
    private readonly billing: InternalProjectBillingService,
    private readonly dataMartService: DataMartService,
    private readonly connectorStates: ConnectorStateService
  ) {}

  async run(command: RestoreOwoxStorageCommand): Promise<void> {
    if (command.fromPlugin) {
      throw new ForbiddenException('Plugins cannot restore an OWOX Storage.');
    }

    const storage = await this.dataStorageService.getByProjectIdAndId(
      command.projectId,
      command.storageId
    );

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
    if (!record.deprovisionedAt) return;

    const { subscriptionPlanType } = await this.billing.getBalance(command.projectId);
    if (subscriptionPlanType === ProjectPlanType.NOT_PAID) {
      throw new BusinessViolationException(
        "Pay for this project's subscription before restoring its OWOX Storage."
      );
    }

    // Keeps the daily retry from deleting what this restore creates.
    await this.managedStorages.setDeprovisionPending(record.storageId, false);
    let restored: boolean;
    try {
      try {
        await this.engine.restore(record, command.projectId);
      } catch {
        // The engine has logged the failed step.
        throw new OwoxStorageRestoreException();
      }
      const dataMartIds = (await this.dataMartService.findByStorage(storage)).map(({ id }) => id);
      restored = await this.finishRestore(record.storageId, dataMartIds);
    } catch (error) {
      await this.cleanUpAfterFailure(record);
      throw error;
    }
    if (restored) {
      this.logger.log(`OWOX Storage ${record.datasetId} restored`);
      return;
    }
    // Another restore won, or the storage was deleted meanwhile and what this one created has no record.
    if (await this.managedStorages.findByStorageId(record.storageId)) return;
    await this.deprovisionOrphan(record);
  }

  // Keeps the record deleted and marked for the daily cleanup; a record deleted meanwhile is cleaned here.
  private async cleanUpAfterFailure(record: ManagedStorage): Promise<void> {
    try {
      await this.managedStorages.setDeprovisionPending(record.storageId, true);
    } catch (error) {
      this.logger.error(
        `OWOX Storage ${record.datasetId} could not be marked for cleanup after a failed restore${describeGoogleError(error)}`
      );
    }
    try {
      if (!(await this.managedStorages.findByStorageId(record.storageId))) {
        await this.deprovisionOrphan(record);
      }
    } catch (error) {
      this.logger.error(
        `OWOX Storage ${record.datasetId} could not be checked after a failed restore${describeGoogleError(error)}`
      );
    }
  }

  private async deprovisionOrphan(record: ManagedStorage): Promise<void> {
    try {
      await this.engine.deprovision(record);
    } catch (error) {
      this.logger.error(
        `OWOX Storage ${record.datasetId} was deleted during its restore; deleting what the restore created failed${describeGoogleError(error)}`
      );
    }
  }

  @Transactional()
  private async finishRestore(storageId: string, dataMartIds: string[]): Promise<boolean> {
    if (!(await this.managedStorages.markRestored(storageId, new Date()))) return false;
    // The restored tables are empty: the next runs must load from each connector's start.
    await this.connectorStates.deleteByDataMartIds(dataMartIds);
    return true;
  }
}
