import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { DataQualityRunTrigger } from '../entities/data-quality-run-trigger.entity';
import { TriggerExecutionOwnershipError } from '../../common/scheduler/shared/trigger-execution-ownership.error';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { RunType } from '../../common/scheduler/shared/types';
import { stopRunTriggersForRun } from '../utils/run-trigger-cancellation';

export interface CreateDataQualityRunTriggerParams {
  createdById: string;
  projectId: string;
  dataMartRunId: string;
  runType: RunType;
}

@Injectable()
export class DataQualityRunTriggerService {
  constructor(
    @InjectRepository(DataQualityRunTrigger)
    private readonly repository: Repository<DataQualityRunTrigger>
  ) {}

  async createTrigger(
    params: CreateDataQualityRunTriggerParams,
    manager?: EntityManager
  ): Promise<string> {
    const repository = manager?.getRepository(DataQualityRunTrigger) ?? this.repository;
    const trigger = repository.create({
      ...params,
      isActive: true,
      status: TriggerStatus.IDLE,
    });
    const saved = await repository.save(trigger);
    return saved.id;
  }

  async stopTriggersForRun(dataMartRunId: string): Promise<void> {
    await stopRunTriggersForRun(this.repository, dataMartRunId);
  }

  async findForCancellation(
    dataMartRunId: string,
    manager: EntityManager,
    lock: boolean
  ): Promise<DataQualityRunTrigger | null> {
    return manager.getRepository(DataQualityRunTrigger).findOne({
      where: { dataMartRunId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
  }

  async requestCancellation(
    trigger: DataQualityRunTrigger | null,
    manager: EntityManager
  ): Promise<void> {
    if (!trigger) return;
    if (trigger.status === TriggerStatus.CANCELLED) return;

    const nextStatus =
      trigger.status === TriggerStatus.PROCESSING
        ? TriggerStatus.CANCELLING
        : TriggerStatus.CANCELLED;
    const isActive = false;
    const executionVersion = trigger.version;
    const { affected } = await manager.getRepository(DataQualityRunTrigger).update(
      { id: trigger.id, status: trigger.status, version: executionVersion },
      {
        status: nextStatus,
        isActive,
        version: () => 'version + 1',
      }
    );
    if (!affected) {
      throw new TriggerExecutionOwnershipError(trigger.id, executionVersion);
    }
    trigger.status = nextStatus;
    trigger.isActive = isActive;
    trigger.version = executionVersion + 1;
  }
}
