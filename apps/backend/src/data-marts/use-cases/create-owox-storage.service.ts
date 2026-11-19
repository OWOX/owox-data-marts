import { ForbiddenException, Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { OwoxEventDispatcher } from '../../common/event-dispatcher/owox-event-dispatcher';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { isUniqueConstraintViolation } from '../../common/typeorm/query-error.utils';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { CreateOwoxStorageCommand } from '../dto/domain/create-owox-storage.command';
import { DataStorageDto } from '../dto/domain/data-storage.dto';
import { DataStorage } from '../entities/data-storage.entity';
import { StorageConfigSetEvent } from '../events/storage-config-set.event';
import { ProjectPlanType } from '../enums/project-plan-type.enum';
import {
  MANAGED_STORAGE_ENGINE,
  ManagedStorageEngine,
  ProvisionedManagedStorage,
} from '../owox-storage/engine/managed-storage-engine';
import { ManagedStorageService } from '../owox-storage/managed-storage.service';
import { OwoxStorageConfigService } from '../owox-storage/owox-storage-config.service';
import { InternalProjectBillingService } from '../services/project-billing/internal-project-billing.service';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import { describeGoogleError } from '../owox-storage/engine/bigquery-managed-storage.engine';
import { assertProjectMembers } from '../utils/sync-owners';
import { CreateDataStorageService } from './create-data-storage.service';

const ALREADY_HAS = 'This project already has an OWOX Storage.';

@Injectable()
export class CreateOwoxStorageService {
  private readonly logger = new Logger(CreateOwoxStorageService.name);

  constructor(
    private readonly configService: OwoxStorageConfigService,
    private readonly billing: InternalProjectBillingService,
    private readonly managedStorageService: ManagedStorageService,
    @Inject(MANAGED_STORAGE_ENGINE) private readonly engine: ManagedStorageEngine,
    private readonly createDataStorageService: CreateDataStorageService,
    @InjectRepository(DataStorage)
    private readonly dataStorageRepository: Repository<DataStorage>,
    private readonly idpProjectionsFacade: IdpProjectionsFacade,
    private readonly eventDispatcher: OwoxEventDispatcher
  ) {}

  async run(command: CreateOwoxStorageCommand): Promise<DataStorageDto> {
    if (command.fromPlugin) {
      throw new ForbiddenException('A plugin cannot create an OWOX Storage.');
    }
    this.configService.getSettings();

    const { subscriptionPlanType } = await this.billing.getBalance(command.projectId);
    if (subscriptionPlanType === ProjectPlanType.NOT_PAID) {
      throw new BusinessViolationException(
        'A project with an unpaid subscription cannot create an OWOX Storage.'
      );
    }
    if (await this.managedStorageService.findByProjectId(command.projectId)) {
      throw new BusinessViolationException(ALREADY_HAS);
    }

    // Before provisioning: a bad owner would otherwise fail the save and cost a full provision/deprovision cycle.
    await assertProjectMembers(
      command.projectId,
      command.ownerIds ?? [command.userId],
      this.idpProjectionsFacade
    );

    const provisioned = await this.engine.provision({
      projectId: command.projectId,
      location: command.location,
    });

    let saved: DataStorageDto;
    try {
      saved = await this.save(command, provisioned);
    } catch (error) {
      try {
        await this.engine.deprovision(provisioned);
      } catch (deprovisionError) {
        // Dataset id (carries the short id) lets ops find leaked resources; no email or project ids.
        this.logger.error(
          `OWOX Storage ${provisioned.datasetId} deprovision failed after a failed save${describeGoogleError(deprovisionError)}`
        );
      }
      if (isUniqueConstraintViolation(error)) {
        throw new BusinessViolationException(ALREADY_HAS);
      }
      throw error;
    }
    await this.eventDispatcher.publishExternal(
      new StorageConfigSetEvent(saved.id, command.projectId, command.userId)
    );
    return saved;
  }

  @Transactional()
  private async save(
    command: CreateOwoxStorageCommand,
    provisioned: ProvisionedManagedStorage
  ): Promise<DataStorageDto> {
    const created = await this.createDataStorageService.run({
      type: DataStorageType.GOOGLE_BIGQUERY,
      projectId: command.projectId,
      userId: command.userId,
      ownerIds: command.ownerIds,
    });
    // The record's 'US'/'EU' is the location, never autodetected: the scan-limit usage read relies on it.
    const config = { projectId: provisioned.gcpProjectId, location: provisioned.location };
    await this.dataStorageRepository.update(created.id, { title: command.title, config });
    await this.managedStorageService.create({
      storageId: created.id,
      projectId: command.projectId,
      ...provisioned,
      storageLimitBytes: null,
      queryLimitBytesPerDay: null,
      notPaidSince: null,
      lastActivityAt: null,
      deprovisionedAt: null,
      deprovisionPending: false,
    });
    return new DataStorageDto(
      created.id,
      command.title,
      created.type,
      created.projectId,
      config as DataStorageDto['config'],
      created.createdAt,
      created.modifiedAt,
      created.dataMartsCount,
      created.draftsCount,
      created.createdByUser,
      created.ownerUsers,
      created.availableForUse,
      created.availableForMaintenance,
      created.contexts,
      created.reusableCredential
    );
  }
}
