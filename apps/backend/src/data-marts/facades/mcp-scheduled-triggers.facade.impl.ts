import { BadRequestException, Injectable } from '@nestjs/common';
import { CronTime } from 'cron';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { CreateScheduledTriggerCommand } from '../dto/domain/create-scheduled-trigger.command';
import { DeleteScheduledTriggerCommand } from '../dto/domain/delete-scheduled-trigger.command';
import { ListProjectScheduledTriggersCommand } from '../dto/domain/list-project-scheduled-triggers.command';
import { ProjectScheduledTriggerDto } from '../dto/domain/project-scheduled-trigger.dto';
import { ScheduledTriggerDto } from '../dto/domain/scheduled-trigger.dto';
import { UpdateScheduledTriggerCommand } from '../dto/domain/update-scheduled-trigger.command';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import { ScheduledTriggerType } from '../scheduled-trigger-types/enums/scheduled-trigger-type.enum';
import { ScheduledReportRunConfigType } from '../scheduled-trigger-types/scheduled-report-run/schemas/scheduled-report-run-config.schema';
import { isScheduledReportRunConfig } from '../scheduled-trigger-types/scheduled-trigger-config.guards';
import { ReportService } from '../services/report.service';
import { ScheduledTriggerService } from '../services/scheduled-trigger.service';
import { CreateScheduledTriggerService } from '../use-cases/create-scheduled-trigger.service';
import { DeleteScheduledTriggerService } from '../use-cases/delete-scheduled-trigger.service';
import { ListProjectScheduledTriggersService } from '../use-cases/list-project-scheduled-triggers.service';
import { UpdateScheduledTriggerService } from '../use-cases/update-scheduled-trigger.service';
import {
  McpReportRunScheduleItem,
  McpReportRunScheduleResult,
  McpScheduledTriggersContext,
  McpScheduledTriggersFacade,
} from './mcp-scheduled-triggers.facade';

const REPORT_RUN_SCHEDULES_PAGE_SIZE = 500;

@Injectable()
export class McpScheduledTriggersFacadeImpl implements McpScheduledTriggersFacade {
  constructor(
    private readonly listProjectScheduledTriggersService: ListProjectScheduledTriggersService,
    private readonly createScheduledTriggerService: CreateScheduledTriggerService,
    private readonly deleteScheduledTriggerService: DeleteScheduledTriggerService,
    private readonly updateScheduledTriggerService: UpdateScheduledTriggerService,
    private readonly reportService: ReportService,
    private readonly scheduledTriggerService: ScheduledTriggerService
  ) {}

  async listReportRunSchedules(
    ctx: McpScheduledTriggersContext
  ): Promise<McpReportRunScheduleItem[]> {
    const items: McpReportRunScheduleItem[] = [];
    let offset = 0;
    let page: ProjectScheduledTriggerDto[];

    do {
      page = await this.listProjectScheduledTriggersService.run(
        new ListProjectScheduledTriggersCommand(
          ctx.projectId,
          REPORT_RUN_SCHEDULES_PAGE_SIZE,
          offset,
          ctx.userId,
          ctx.roles,
          ScheduledTriggerType.REPORT_RUN
        )
      );

      for (const dto of page) {
        items.push({
          triggerId: dto.trigger.id,
          report: this.reportRefOf(dto.trigger.triggerConfig),
          dataMart: dto.dataMart,
          cronExpression: dto.trigger.cronExpression,
          timeZone: dto.trigger.timeZone,
          isActive: dto.trigger.isActive,
          nextRunAt: dto.trigger.nextRunTimestamp?.toISOString() ?? null,
          lastRunAt: dto.trigger.lastRunTimestamp?.toISOString() ?? null,
          canEdit: dto.canEdit,
          canDelete: dto.canDelete,
        });
      }

      offset += REPORT_RUN_SCHEDULES_PAGE_SIZE;
    } while (page.length === REPORT_RUN_SCHEDULES_PAGE_SIZE);

    return items;
  }

  async createReportRunSchedule(
    ctx: McpScheduledTriggersContext,
    input: { reportId: string; cronExpression: string; timeZone: string; isActive: boolean }
  ): Promise<McpReportRunScheduleResult> {
    this.assertValidSchedule(input.cronExpression, input.timeZone);

    const report = await this.reportService.getByIdAndProjectId(input.reportId, ctx.projectId);
    const dataMartId = report.dataMart.id;

    const dto = await this.createScheduledTriggerService.run(
      new CreateScheduledTriggerCommand(
        ctx.projectId,
        ctx.userId,
        dataMartId,
        ScheduledTriggerType.REPORT_RUN,
        input.cronExpression,
        input.timeZone,
        input.isActive,
        { type: ScheduledReportRunConfigType, reportId: input.reportId },
        ctx.roles
      )
    );

    return this.toResult(dto, input.reportId);
  }

  async updateReportRunSchedule(
    ctx: McpScheduledTriggersContext,
    input: { triggerId: string; cronExpression: string; timeZone: string; isActive: boolean }
  ): Promise<McpReportRunScheduleResult> {
    this.assertValidSchedule(input.cronExpression, input.timeZone);

    const trigger = await this.scheduledTriggerService.getByIdAndProjectId(
      input.triggerId,
      ctx.projectId
    );
    const reportId = this.assertReportRunWithConfig(trigger);

    const dto = await this.updateScheduledTriggerService.run(
      new UpdateScheduledTriggerCommand(
        trigger.id,
        trigger.dataMart.id,
        ctx.projectId,
        ctx.userId,
        ctx.roles,
        input.cronExpression,
        input.timeZone,
        input.isActive
      )
    );

    return this.toResult(dto, reportId);
  }

  async deleteReportRunSchedule(
    ctx: McpScheduledTriggersContext,
    input: { triggerId: string }
  ): Promise<{ triggerId: string; reportId: string | null }> {
    const trigger = await this.scheduledTriggerService.getByIdAndProjectId(
      input.triggerId,
      ctx.projectId
    );

    this.assertReportRun(trigger);

    const reportId = this.reportIdOrNull(trigger.triggerConfig);

    await this.deleteScheduledTriggerService.run(
      new DeleteScheduledTriggerCommand(
        trigger.id,
        trigger.dataMart.id,
        ctx.projectId,
        ctx.userId,
        ctx.roles
      )
    );

    return { triggerId: trigger.id, reportId };
  }

  private assertValidSchedule(cronExpression: string, timeZone: string): void {
    try {
      new CronTime(cronExpression, timeZone).getNextDateFrom(new Date(), timeZone);
    } catch {
      throw new BusinessViolationException('Invalid cron expression or timezone', {
        cronExpression,
        timeZone,
      });
    }
  }

  private assertReportRun(trigger: DataMartScheduledTrigger): void {
    if (trigger.type !== ScheduledTriggerType.REPORT_RUN) {
      throw new BadRequestException('Scheduled trigger is not a report run schedule');
    }
  }

  private assertReportRunWithConfig(trigger: DataMartScheduledTrigger): string {
    this.assertReportRun(trigger);

    if (!isScheduledReportRunConfig(trigger.triggerConfig)) {
      throw new BadRequestException('Report ID is required for REPORT_RUN schedules');
    }

    return trigger.triggerConfig.reportId;
  }

  private reportIdOrNull(config: DataMartScheduledTrigger['triggerConfig']): string | null {
    return isScheduledReportRunConfig(config) ? config.reportId : null;
  }

  private reportRefOf(config: DataMartScheduledTrigger['triggerConfig']): {
    id: string;
    title: string;
  } {
    if (!isScheduledReportRunConfig(config)) {
      return { id: '', title: '' };
    }
    const enrichedTitle = (config as { report?: { title?: string } }).report?.title;
    return { id: config.reportId, title: enrichedTitle ?? '' };
  }

  private toResult(dto: ScheduledTriggerDto, reportId: string): McpReportRunScheduleResult {
    return {
      triggerId: dto.id,
      reportId,
      cronExpression: dto.cronExpression,
      timeZone: dto.timeZone,
      isActive: dto.isActive,
      nextRunAt: dto.nextRunTimestamp?.toISOString() ?? null,
    };
  }
}
