import { Injectable } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
import {
  TriggerExecutionOwnership,
  TriggerExecutionOwnershipError,
} from '../../common/scheduler/shared/trigger-execution-ownership.error';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { ConsumptionTrackingService } from './consumption-tracking.service';

export class DataQualityConsumptionPublicationError extends Error {
  constructor(readonly cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'DataQualityConsumptionPublicationError';
  }
}

/**
 * Settles the durable consumption obligation created when a Data Quality run enters RUNNING.
 * A non-null marker means either the idempotent command was published or tracking was disabled.
 */
@Injectable()
export class DataQualityConsumptionService {
  constructor(
    private readonly consumptionTrackingService: ConsumptionTrackingService,
    private readonly systemClock: SystemTimeService
  ) {}

  async settle(
    manager: EntityManager,
    dataMartRun: DataMartRun,
    ownership?: TriggerExecutionOwnership
  ): Promise<void> {
    if (dataMartRun.dataQualityConsumptionPublishedAt) return;
    if (
      dataMartRun.status !== DataMartRunStatus.RUNNING ||
      !dataMartRun.startedAt ||
      !dataMartRun.dataMart
    ) {
      throw new DataQualityConsumptionPublicationError(
        new Error('Cannot settle Data Quality consumption before durable RUNNING')
      );
    }

    try {
      await ownership?.assertOwned(manager);
      await this.consumptionTrackingService.registerDataQualityRunConsumption(
        dataMartRun.dataMart,
        dataMartRun.id,
        dataMartRun.startedAt
      );

      const settledAt = this.systemClock.now();
      const repository = manager.getRepository(DataMartRun);
      const marker = await repository.update(
        {
          id: dataMartRun.id,
          type: DataMartRunType.DATA_QUALITY,
          dataQualityConsumptionPublishedAt: IsNull(),
        },
        { dataQualityConsumptionPublishedAt: settledAt }
      );
      if (marker.affected) {
        dataMartRun.dataQualityConsumptionPublishedAt = settledAt;
        return;
      }

      const reloaded = await repository.findOne({
        select: { id: true, dataQualityConsumptionPublishedAt: true },
        where: { id: dataMartRun.id, type: DataMartRunType.DATA_QUALITY },
      });
      if (!reloaded?.dataQualityConsumptionPublishedAt) {
        throw new Error(
          `Failed to persist consumption settlement marker for Data Quality run ${dataMartRun.id}`
        );
      }
      dataMartRun.dataQualityConsumptionPublishedAt = reloaded.dataQualityConsumptionPublishedAt;
    } catch (error) {
      if (error instanceof TriggerExecutionOwnershipError) throw error;
      if (error instanceof DataQualityConsumptionPublicationError) throw error;
      throw new DataQualityConsumptionPublicationError(error);
    }
  }
}
