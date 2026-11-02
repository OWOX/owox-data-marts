import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { RestoreOwoxStorageCommand } from '../dto/domain/restore-owox-storage.command';
import { ConnectorState } from '../entities/connector-state.entity';
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
    @InjectRepository(ConnectorState)
    private readonly connectorStates: Repository<ConnectorState>
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

    try {
      await this.engine.restore(record, command.projectId);
    } catch (error) {
      this.logger.error(
        `OWOX Storage ${record.datasetId} restore failed${describeGoogleError(error)}`
      );
      throw new OwoxStorageRestoreException();
    }

    const dataMartIds = (await this.dataMartService.findByStorage(storage)).map(({ id }) => id);
    await this.markRestored(record, dataMartIds);
    this.logger.log(`OWOX Storage ${record.datasetId} restored`);
  }

  @Transactional()
  private async markRestored(record: ManagedStorage, dataMartIds: string[]): Promise<void> {
    // The restored tables are empty: the next runs must load from each connector's start.
    await this.connectorStates.delete({ datamartId: In(dataMartIds) });
    record.deprovisionedAt = null;
    record.notPaidSince = null;
    record.lastActivityAt = new Date();
    await this.managedStorages.save(record);
  }
}
