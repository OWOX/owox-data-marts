import { Transactional } from 'typeorm-transactional';
import { DataMartService } from '../services/data-mart.service';
import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeleteScheduledTriggerCommand } from '../dto/domain/delete-scheduled-trigger.command';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import { ScheduledTriggerService } from '../services/scheduled-trigger.service';
import { ReportAccessService } from '../services/report-access.service';
import { ReportService } from '../services/report.service';
import { ScheduledTriggerType } from '../scheduled-trigger-types/enums/scheduled-trigger-type.enum';
import { isScheduledReportRunConfig } from '../scheduled-trigger-types/scheduled-trigger-config.guards';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';

@Injectable()
export class DeleteScheduledTriggerService {
  constructor(
    @InjectRepository(DataMartScheduledTrigger)
    private readonly triggerRepository: Repository<DataMartScheduledTrigger>,
    private readonly scheduledTriggerService: ScheduledTriggerService,
    private readonly reportAccessService: ReportAccessService,
    private readonly reportService: ReportService,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly dataMartService: DataMartService
  ) {}

  async run(command: DeleteScheduledTriggerCommand): Promise<void> {
    const trigger = await this.scheduledTriggerService.getByIdAndDataMartIdAndProjectId(
      command.id,
      command.dataMartId,
      command.projectId
    );

    await this.checkAccess(command, trigger);
    return this.commit(command);
  }

  @Transactional()
  private async commit(command: DeleteScheduledTriggerCommand): Promise<void> {
    await this.dataMartService.lockConfigurationReferences(command.projectId);
    const trigger = await this.scheduledTriggerService.getByIdAndDataMartIdAndProjectId(
      command.id,
      command.dataMartId,
      command.projectId
    );
    if (trigger.type !== ScheduledTriggerType.REPORT_RUN) {
      if (
        !(await this.accessDecisionService.canAccessStored(
          command.userId,
          command.roles,
          EntityType.DATA_MART,
          command.dataMartId,
          Action.MANAGE_TRIGGERS,
          command.projectId
        ))
      )
        throw new ForbiddenException(
          'You do not have permission to manage triggers for this DataMart.'
        );
      await this.dataMartService.advanceConfigurationRevision(
        this.triggerRepository.manager,
        command.dataMartId,
        command.projectId,
        command.expectedRevision
      );
    }

    await this.triggerRepository.delete({
      id: command.id,
      dataMart: {
        id: command.dataMartId,
        projectId: command.projectId,
      },
    });
  }

  private async checkAccess(
    command: DeleteScheduledTriggerCommand,
    trigger: DataMartScheduledTrigger
  ): Promise<void> {
    if (trigger.type === ScheduledTriggerType.REPORT_RUN) {
      if (!isScheduledReportRunConfig(trigger.triggerConfig)) {
        throw new BadRequestException('Report ID is required for REPORT_RUN triggers');
      }

      await this.reportService.getByIdAndDataMartIdAndProjectId(
        trigger.triggerConfig.reportId,
        command.dataMartId,
        command.projectId
      );

      await this.reportAccessService.checkOperateAccess(
        command.userId,
        command.roles,
        trigger.triggerConfig.reportId,
        command.projectId
      );
    } else {
      const canManageTriggers = await this.accessDecisionService.canAccessDmTrigger(
        command.userId,
        command.roles,
        trigger.id,
        command.dataMartId,
        Action.MANAGE_TRIGGERS,
        command.projectId
      );

      if (!canManageTriggers) {
        throw new ForbiddenException(
          'You do not have permission to manage triggers for this DataMart.'
        );
      }
    }
  }
}
