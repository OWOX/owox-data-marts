import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConnectorRunTrigger } from '../../entities/connector-run-trigger.entity';
import { TriggerStatus } from '../../../common/scheduler/shared/entities/trigger-status';
import { RunType } from '../../../common/scheduler/shared/types';

export interface CreateConnectorRunTriggerParams {
  dataMartId: string;
  projectId: string;
  createdById: string;
  dataMartRunId: string;
  runType: RunType;
  payload?: Record<string, unknown>;
}

@Injectable()
export class ConnectorRunTriggerService {
  constructor(
    @InjectRepository(ConnectorRunTrigger)
    private readonly repository: Repository<ConnectorRunTrigger>
  ) {}

  async createTrigger(params: CreateConnectorRunTriggerParams): Promise<string> {
    const trigger = this.repository.create({
      dataMartId: params.dataMartId,
      projectId: params.projectId,
      createdById: params.createdById,
      dataMartRunId: params.dataMartRunId,
      runType: params.runType,
      payload: params.payload ?? null,
      isActive: true,
      status: TriggerStatus.IDLE,
    });

    const saved = await this.repository.save(trigger);
    return saved.id;
  }
}
