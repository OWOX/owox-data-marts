import { Injectable } from '@nestjs/common';
import { RunType } from '../../common/scheduler/shared/types';
import { RunDataMartCommand } from '../dto/domain/run-data-mart.command';
import { GetDataMartRunCommand } from '../dto/domain/get-data-mart-run.command';
import { GetDataMartRunsCommand } from '../dto/domain/get-data-mart-runs.command';
import { CancelDataMartRunCommand } from '../dto/domain/cancel-data-mart-run.command';
import { McpDataMartExecutionMapper } from '../mappers/mcp-data-mart-execution.mapper';
import { RunDataMartService } from '../use-cases/run-data-mart.service';
import { GetDataMartRunService } from '../use-cases/get-data-mart-run.service';
import { ListDataMartRunsService } from '../use-cases/list-data-mart-runs.service';
import { CancelDataMartRunService } from '../use-cases/cancel-data-mart-run.service';
import { ListScheduledTriggersCommand } from '../dto/domain/list-scheduled-triggers.command';
import { CreateScheduledTriggerCommand } from '../dto/domain/create-scheduled-trigger.command';
import { UpdateScheduledTriggerCommand } from '../dto/domain/update-scheduled-trigger.command';
import { DeleteScheduledTriggerCommand } from '../dto/domain/delete-scheduled-trigger.command';
import { ScheduledTriggerType } from '../scheduled-trigger-types/enums/scheduled-trigger-type.enum';
import { ListScheduledTriggersService } from '../use-cases/list-scheduled-triggers.service';
import { CreateScheduledTriggerService } from '../use-cases/create-scheduled-trigger.service';
import { UpdateScheduledTriggerService } from '../use-cases/update-scheduled-trigger.service';
import { DeleteScheduledTriggerService } from '../use-cases/delete-scheduled-trigger.service';
import {
  McpDataMartExecutionContext,
  McpDataMartExecutionFacade,
  McpDataMartRunInput,
  McpDataMartRunRef,
  McpCreateDataMartScheduleInput,
  McpUpdateDataMartScheduleInput,
} from './mcp-data-mart-execution.facade';

@Injectable()
export class McpDataMartExecutionFacadeImpl implements McpDataMartExecutionFacade {
  constructor(
    private readonly runDataMart: RunDataMartService,
    private readonly getDataMartRun: GetDataMartRunService,
    private readonly listDataMartRuns: ListDataMartRunsService,
    private readonly cancelDataMartRun: CancelDataMartRunService,
    private readonly listScheduledTriggers: ListScheduledTriggersService,
    private readonly createScheduledTrigger: CreateScheduledTriggerService,
    private readonly updateScheduledTrigger: UpdateScheduledTriggerService,
    private readonly deleteScheduledTrigger: DeleteScheduledTriggerService,
    private readonly mapper: McpDataMartExecutionMapper
  ) {}
  async run(ctx: McpDataMartExecutionContext, input: McpDataMartRunInput) {
    const runId = await this.runDataMart.run(
      new RunDataMartCommand(
        input.dataMartId,
        ctx.projectId,
        ctx.userId,
        RunType.manual,
        input.payload,
        ctx.roles
      )
    );
    return { dataMartId: input.dataMartId, runId, status: 'queued' as const };
  }
  async getRun(ctx: McpDataMartExecutionContext, input: McpDataMartRunRef) {
    return this.mapper.toRun(
      await this.getDataMartRun.run(
        new GetDataMartRunCommand(
          input.dataMartId,
          ctx.projectId,
          input.runId,
          ctx.userId,
          ctx.roles
        )
      )
    );
  }
  async listRuns(
    ctx: McpDataMartExecutionContext,
    input: { dataMartId: string; limit: number; offset: number }
  ) {
    const runs = await this.listDataMartRuns.run(
      new GetDataMartRunsCommand(
        input.dataMartId,
        ctx.projectId,
        input.limit,
        input.offset,
        ctx.userId,
        ctx.roles
      )
    );
    return runs.map(run => this.mapper.toRun(run));
  }
  async cancelRun(ctx: McpDataMartExecutionContext, input: McpDataMartRunRef) {
    await this.cancelDataMartRun.run(
      new CancelDataMartRunCommand(
        input.dataMartId,
        input.runId,
        ctx.projectId,
        ctx.userId,
        ctx.roles
      )
    );
    return { dataMartId: input.dataMartId, runId: input.runId, cancellationApplied: true as const };
  }
  async listSchedules(ctx: McpDataMartExecutionContext, input: { dataMartId: string }) {
    const triggers = await this.listScheduledTriggers.run(
      new ListScheduledTriggersCommand(input.dataMartId, ctx.projectId, ctx.userId, ctx.roles)
    );
    return triggers
      .filter(trigger => trigger.type === ScheduledTriggerType.CONNECTOR_RUN)
      .map(trigger => this.mapper.toSchedule(trigger, input.dataMartId));
  }
  async createSchedule(ctx: McpDataMartExecutionContext, input: McpCreateDataMartScheduleInput) {
    return this.mapper.toSchedule(
      await this.createScheduledTrigger.run(
        new CreateScheduledTriggerCommand(
          ctx.projectId,
          ctx.userId,
          input.dataMartId,
          ScheduledTriggerType.CONNECTOR_RUN,
          input.cronExpression,
          input.timeZone,
          input.isActive,
          undefined,
          ctx.roles
        )
      ),
      input.dataMartId
    );
  }
  async updateSchedule(ctx: McpDataMartExecutionContext, input: McpUpdateDataMartScheduleInput) {
    return this.mapper.toSchedule(
      await this.updateScheduledTrigger.run(
        new UpdateScheduledTriggerCommand(
          input.triggerId,
          input.dataMartId,
          ctx.projectId,
          ctx.userId,
          ctx.roles,
          input.cronExpression,
          input.timeZone,
          input.isActive,
          ScheduledTriggerType.CONNECTOR_RUN
        )
      ),
      input.dataMartId
    );
  }
  async deleteSchedule(
    ctx: McpDataMartExecutionContext,
    input: { dataMartId: string; triggerId: string }
  ) {
    await this.deleteScheduledTrigger.run(
      new DeleteScheduledTriggerCommand(
        input.triggerId,
        input.dataMartId,
        ctx.projectId,
        ctx.userId,
        ctx.roles,
        ScheduledTriggerType.CONNECTOR_RUN
      )
    );
    return { dataMartId: input.dataMartId, triggerId: input.triggerId };
  }
}
