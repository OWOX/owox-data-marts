import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportRunTrigger } from '../entities/report-run-trigger.entity';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { RunType } from '../../common/scheduler/shared/types';

export interface CreateReportRunTriggerParams {
  reportId: string;
  userId: string;
  projectId: string;
  dataMartRunId: string;
  runType: RunType;
}

@Injectable()
export class ReportRunTriggerService {
  constructor(
    @InjectRepository(ReportRunTrigger)
    private readonly repository: Repository<ReportRunTrigger>
  ) {}

  async createTrigger(params: CreateReportRunTriggerParams): Promise<string> {
    const trigger = this.repository.create({
      reportId: params.reportId,
      userId: params.userId,
      projectId: params.projectId,
      dataMartRunId: params.dataMartRunId,
      runType: params.runType,
      isActive: true,
      status: TriggerStatus.IDLE,
    });

    const saved = await this.repository.save(trigger);
    return saved.id;
  }
}
