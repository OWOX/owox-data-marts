import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConnectorRunTrigger } from '../entities/connector-run-trigger.entity';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { RunType } from '../../common/scheduler/shared/types';

@Injectable()
export class ConnectorRunTriggerService {
  constructor(
    @InjectRepository(ConnectorRunTrigger)
    private readonly repository: Repository<ConnectorRunTrigger>
  ) {}

  async createTrigger(params: {
    dataMartId: string;
    projectId: string;
    createdById: string;
    dataMartRunId: string;
    runType: RunType;
    payload?: Record<string, unknown>;
  }): Promise<string> {
    const trigger = new ConnectorRunTrigger();
    trigger.dataMartId = params.dataMartId;
    trigger.projectId = params.projectId;
    trigger.createdById = params.createdById;
    trigger.dataMartRunId = params.dataMartRunId;
    trigger.runType = params.runType;
    trigger.payload = params.payload ?? null;
    trigger.isActive = true;
    trigger.status = TriggerStatus.IDLE;

    const saved = await this.repository.save(trigger);
    return saved.id;
  }
}
