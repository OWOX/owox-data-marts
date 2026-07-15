import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { RunType } from '../../common/scheduler/shared/types';
import { DataQualityRunTrigger } from '../entities/data-quality-run-trigger.entity';
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
}
