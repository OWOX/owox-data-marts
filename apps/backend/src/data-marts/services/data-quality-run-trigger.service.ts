import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { DataQualityRunTrigger } from '../entities/data-quality-run-trigger.entity';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { RunType } from '../../common/scheduler/shared/types';

interface CreateDataQualityRunTriggerParams {
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
    await manager
      .getRepository(DataQualityRunTrigger)
      .update({ id: trigger.id, status: trigger.status }, { status: nextStatus, isActive });
    trigger.status = nextStatus;
    trigger.isActive = isActive;
  }
}
