import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportRunTrigger } from '../entities/report-run-trigger.entity';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { RunType } from '../../common/scheduler/shared/types';

@Injectable()
export class ReportRunTriggerService {
  constructor(
    @InjectRepository(ReportRunTrigger)
    private readonly repository: Repository<ReportRunTrigger>
  ) {}

  async createTrigger(params: {
    reportId: string;
    userId: string;
    projectId: string;
    dataMartRunId?: string | null;
    runType: RunType;
  }): Promise<string> {
    const trigger = new ReportRunTrigger();
    trigger.reportId = params.reportId;
    trigger.userId = params.userId;
    trigger.projectId = params.projectId;
    trigger.dataMartRunId = params.dataMartRunId ?? null;
    trigger.runType = params.runType;
    trigger.isActive = true;
    trigger.status = TriggerStatus.IDLE;

    const saved = await this.repository.save(trigger);
    return saved.id;
  }
}
