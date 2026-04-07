import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeleteScheduledTriggerCommand } from '../dto/domain/delete-scheduled-trigger.command';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import { ScheduledTriggerService } from '../services/scheduled-trigger.service';
import { ReportAccessService } from '../services/report-access.service';
import { ScheduledTriggerType } from '../scheduled-trigger-types/enums/scheduled-trigger-type.enum';
import { isScheduledReportRunConfig } from '../scheduled-trigger-types/scheduled-trigger-config.guards';

@Injectable()
export class DeleteScheduledTriggerService {
  constructor(
    @InjectRepository(DataMartScheduledTrigger)
    private readonly triggerRepository: Repository<DataMartScheduledTrigger>,
    private readonly scheduledTriggerService: ScheduledTriggerService,
    private readonly reportAccessService: ReportAccessService
  ) {}

  async run(command: DeleteScheduledTriggerCommand): Promise<void> {
    const trigger = await this.scheduledTriggerService.getByIdAndDataMartIdAndProjectId(
      command.id,
      command.dataMartId,
      command.projectId
    );

    await this.checkAccess(command, trigger);

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

      const canMutate = await this.reportAccessService.canMutate(
        command.userId,
        command.roles,
        trigger.triggerConfig.reportId,
        command.projectId
      );

      if (!canMutate) {
        throw new ForbiddenException(
          'You do not have permission to delete triggers for this report. Only report owners can manage report triggers.'
        );
      }
    } else {
      if (!this.reportAccessService.isTechnicalUser(command.roles)) {
        throw new ForbiddenException('Only Technical Users can delete connector run triggers.');
      }
    }
  }
}
