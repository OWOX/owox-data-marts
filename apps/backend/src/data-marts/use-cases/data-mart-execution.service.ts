import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  DataMartExecutionActor,
  DataMartRunLoadRequest,
  DataMartSaveScheduleRequest,
  DataMartDeleteScheduleRequest,
  DataMartExecutionMutationDto,
  DataMartExecutionRequest,
  DataMartExecutionRunRequest,
  DataMartExecutionCancellationDto,
  DataMartExecutionRunDto,
  DataMartLoadSchedulesDto,
  McpDataMartExecutionFacade,
} from '../facades/mcp-data-mart-execution.facade';
import { DataMartService } from '../services/data-mart.service';
import { DataMartRunService } from '../services/data-mart-run.service';
import { ScheduledTriggerService } from '../services/scheduled-trigger.service';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { McpDataMartExecutionMapper } from '../mappers/mcp-data-mart-execution.mapper';
import { CancelDataMartRunService } from './cancel-data-mart-run.service';
import { CancelDataMartRunCommand } from '../dto/domain/cancel-data-mart-run.command';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { ScheduledTriggerType } from '../scheduled-trigger-types/enums/scheduled-trigger-type.enum';
import { DataSource } from 'typeorm';
import { runInTransaction, Transactional } from 'typeorm-transactional';
import { CronTime } from 'cron';
import {
  MutationReceiptService,
  MutationIdentity,
} from '../../common/mutations/mutation-receipt.service';
import { MutationReceipt } from '../../common/mutations/mutation-receipt.entity';
import { ConnectorExecutionService } from '../services/connector/connector-execution.service';
import { lockDataMartConnectorWork } from '../services/connector/connector-work-lifecycle';
import { RunType } from '../../common/scheduler/shared/types';
import { RunDataMartService } from './run-data-mart.service';
import { ConnectorRunTrigger } from '../entities/connector-run-trigger.entity';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { readBackfillChainMeta } from '../utils/manual-backfill-range';

@Injectable()
export class DataMartExecutionService implements McpDataMartExecutionFacade {
  constructor(
    private readonly marts: DataMartService,
    private readonly runs: DataMartRunService,
    private readonly schedules: ScheduledTriggerService,
    private readonly access: AccessDecisionService,
    private readonly cancellation: CancelDataMartRunService,
    private readonly mapper: McpDataMartExecutionMapper,
    private readonly dataSource: DataSource,
    private readonly receipts: MutationReceiptService,
    private readonly execution: ConnectorExecutionService,
    private readonly manualRuns: RunDataMartService
  ) {}

  @Transactional()
  async getRun(request: DataMartExecutionRunRequest): Promise<DataMartExecutionRunDto> {
    const run = await this.scopedRun(request);
    await this.requireAction(request, Action.SEE);
    const mart = await this.requireDataMart(request);
    return this.mapper.toRun(run, mart.revision);
  }

  @Transactional()
  async listSchedules(request: DataMartExecutionRequest): Promise<DataMartLoadSchedulesDto> {
    const mart = await this.requireDataMart(request);
    await this.requireAction(request, Action.MANAGE_TRIGGERS);
    const triggers = await this.schedules.getAllByDataMartIdAndProjectId(
      request.dataMartId,
      request.projectId
    );
    return {
      dataMartId: request.dataMartId,
      revision: mart.revision,
      revisionAggregate: 'data-mart-configuration',
      schedules: triggers
        .filter(trigger => trigger.type === ScheduledTriggerType.CONNECTOR_RUN)
        .map(trigger => this.mapper.toSchedule(trigger, mart.revision)),
    };
  }

  async cancelRun(request: DataMartExecutionRunRequest): Promise<DataMartExecutionCancellationDto> {
    const run = await this.scopedRun(request);
    await this.requireAction(request, Action.EDIT);
    if (run.type !== DataMartRunType.CONNECTOR)
      throw new BadRequestException('Only connector loads can be cancelled through Setup');
    if (!Object.values(DataMartRunStatus).includes(run.status))
      throw new ConflictException('Cannot cancel a run with unknown status');
    const scope = readBackfillChainMeta(run.additionalParams) ? 'backfill-chain' : 'run';
    const alreadyCancelled = run.status === DataMartRunStatus.CANCELLED;
    // Run identity plus the domain's guarded active-status update makes cancellation repeat-safe.
    // A terminal chain anchor may still target its active successor; let the domain resolve it.
    if (!alreadyCancelled) {
      await this.cancellation.run(
        new CancelDataMartRunCommand(
          request.dataMartId,
          request.runId,
          request.projectId,
          request.userId,
          request.roles
        )
      );
    }
    return {
      dataMartId: request.dataMartId,
      requestedRunId: request.runId,
      scope,
      outcome: alreadyCancelled ? 'already-cancelled' : 'cancelled',
      rollback: false,
    };
  }

  async runDataMart(request: DataMartRunLoadRequest): Promise<DataMartExecutionMutationDto> {
    this.precondition(request);
    this.operation(request.operationId);
    const load = request.load ?? { runType: 'INCREMENTAL' as const };
    if (load.runType !== 'INCREMENTAL' && load.runType !== 'MANUAL_BACKFILL')
      throw new BadRequestException('Unsupported connector load type');
    const payload =
      load.runType === 'MANUAL_BACKFILL'
        ? {
            runType: load.runType,
            data: { StartDate: load.startDate, ...(load.endDate ? { EndDate: load.endDate } : {}) },
          }
        : { runType: load.runType };
    const identity = {
      ...this.identity(request, 'run_data_mart', request.dataMartId),
      operationId: request.operationId,
    };
    const intent = {
      expectedRevision: request.expectedRevision,
      load:
        load.runType === 'MANUAL_BACKFILL'
          ? { runType: load.runType, startDate: load.startDate, endDate: load.endDate ?? null }
          : { runType: load.runType },
    };
    const existing = await this.findPrior(identity, intent);
    if (existing) return this.recover(request, existing);
    const mart = await this.requireDataMart(request);
    await this.requireExecutionAction(request, Action.EDIT);
    await this.requireStorageUse(request, mart.storage?.id, false);
    await this.manualRuns.checkStorageAccess(mart);
    return runInTransaction(async () => {
      const manager = this.dataSource.manager;
      await this.marts.lockConfigurationReferences(request.projectId);
      const reservation = await this.receipts.reserve(manager, identity, intent);
      if (!reservation.claimed) return this.recover(request, reservation.receipt);
      await lockDataMartConnectorWork(manager, request.dataMartId, request.projectId);
      await this.requireAction(request, Action.EDIT);
      const current = await this.marts.getByIdAndProjectId(
        request.dataMartId,
        request.projectId,
        manager
      );
      await this.requireStorageUse(request, current.storage?.id, true);
      this.connector(current);
      if (current.revision !== request.expectedRevision)
        throw new ConflictException('Data Mart configuration changed; read it again');
      const runId = await this.execution.run(current, request.userId, RunType.manual, payload);
      const trigger = await manager.findOneByOrFail(ConnectorRunTrigger, { dataMartRunId: runId });
      await this.receipts.complete(manager, reservation.receipt.id, {
        resourceId: request.dataMartId,
        revision: current.revision,
        runId,
        triggerId: trigger.id,
      });
      return this.result(
        request,
        {
          resourceId: request.dataMartId,
          revision: current.revision,
          runId,
          triggerId: trigger.id,
        },
        'Enqueued connector load; completion and data readiness must be read from the run.'
      );
    });
  }

  async saveSchedule(request: DataMartSaveScheduleRequest): Promise<DataMartExecutionMutationDto> {
    this.precondition(request);
    if (!request.scheduleId) this.operation(request.operationId);
    if (
      typeof request.enabled !== 'boolean' ||
      !request.cronExpression?.trim() ||
      request.cronExpression.length > 255 ||
      !request.timeZone?.trim() ||
      request.timeZone.length > 255
    )
      throw new BadRequestException('A cron expression, timezone and enabled state are required');
    try {
      new CronTime(request.cronExpression, request.timeZone);
    } catch {
      throw new BadRequestException('Invalid cron expression or timezone');
    }
    const identity = request.scheduleId
      ? undefined
      : {
          ...this.identity(request, 'create_data_mart_schedule', request.dataMartId),
          operationId: request.operationId!,
        };
    const intent = {
      expectedRevision: request.expectedRevision,
      cronExpression: request.cronExpression,
      timeZone: request.timeZone,
      enabled: request.enabled,
    };
    if (identity) {
      const existing = await this.findPrior(identity, intent);
      if (existing) return this.recover(request, existing);
    }
    await this.requireDataMart(request);
    await this.requireExecutionAction(request, Action.MANAGE_TRIGGERS);
    return runInTransaction(async () => {
      const manager = this.dataSource.manager;
      await this.marts.lockConfigurationReferences(request.projectId);
      let receipt: MutationReceipt | undefined;
      if (identity) {
        const reservation = await this.receipts.reserve(manager, identity, intent);
        if (!reservation.claimed) return this.recover(request, reservation.receipt);
        receipt = reservation.receipt;
      }
      await this.requireAction(request, Action.MANAGE_TRIGGERS);
      const mart = await this.marts.getByIdAndProjectId(
        request.dataMartId,
        request.projectId,
        manager
      );
      this.connector(mart);
      const repository = manager.getRepository(DataMartScheduledTrigger);
      const trigger = request.scheduleId
        ? await repository.findOne({
            where: {
              id: request.scheduleId,
              dataMart: { id: request.dataMartId, projectId: request.projectId },
            },
            relations: ['dataMart'],
          })
        : repository.create({
            dataMart: mart,
            type: ScheduledTriggerType.CONNECTOR_RUN,
            createdById: request.userId,
          });
      if (!trigger || trigger.type !== ScheduledTriggerType.CONNECTOR_RUN)
        throw new NotFoundException('Connector load schedule not found');
      const revision = await this.marts.advanceConfigurationRevision(
        manager,
        request.dataMartId,
        request.projectId,
        request.expectedRevision
      );
      trigger.cronExpression = request.cronExpression;
      trigger.timeZone = request.timeZone;
      if (request.enabled) trigger.scheduleNextRun();
      else trigger.discardNextRun();
      if (request.scheduleId) {
        const updated = await repository.update(trigger.id, {
          cronExpression: trigger.cronExpression,
          timeZone: trigger.timeZone,
          isActive: trigger.isActive,
          status: trigger.status,
          nextRunTimestamp: trigger.nextRunTimestamp,
          version: () => 'version + 1',
        });
        if (updated.affected !== 1) throw new ConflictException('Schedule changed; read it again');
      } else await repository.save(trigger);
      const reference = { resourceId: trigger.id, revision };
      if (receipt) await this.receipts.complete(manager, receipt.id, reference);
      return this.result(
        request,
        reference,
        'Saved connector load schedule; enabled occurrences may consume billable resources.'
      );
    });
  }

  async deleteSchedule(
    request: DataMartDeleteScheduleRequest
  ): Promise<DataMartExecutionMutationDto> {
    this.precondition(request);
    this.operation(request.operationId);
    const identity = {
      ...this.identity(request, 'delete_data_mart_schedule', request.scheduleId),
      operationId: request.operationId,
    };
    const intent = { dataMartId: request.dataMartId, expectedRevision: request.expectedRevision };
    const existing = await this.findPrior(identity, intent);
    if (existing) return this.recover(request, existing);
    await this.requireDataMart(request);
    await this.requireExecutionAction(request, Action.MANAGE_TRIGGERS);
    return runInTransaction(async () => {
      const manager = this.dataSource.manager;
      await this.marts.lockConfigurationReferences(request.projectId);
      const reservation = await this.receipts.reserve(manager, identity, intent);
      if (!reservation.claimed) return this.recover(request, reservation.receipt);
      await this.requireAction(request, Action.MANAGE_TRIGGERS);
      const repository = manager.getRepository(DataMartScheduledTrigger);
      const trigger = await repository.findOne({
        where: {
          id: request.scheduleId,
          dataMart: { id: request.dataMartId, projectId: request.projectId },
        },
        relations: ['dataMart'],
      });
      if (!trigger || trigger.type !== ScheduledTriggerType.CONNECTOR_RUN)
        throw new NotFoundException('Connector load schedule not found');
      const revision = await this.marts.advanceConfigurationRevision(
        manager,
        request.dataMartId,
        request.projectId,
        request.expectedRevision
      );
      await repository.delete(trigger.id);
      const reference = { resourceId: trigger.id, revision, deleted: true };
      await this.receipts.complete(manager, reservation.receipt.id, reference);
      return this.result(
        request,
        reference,
        'Deleted schedule; previously enqueued loads and completed data are preserved.'
      );
    });
  }

  private findPrior(identity: MutationIdentity, intent: unknown) {
    return runInTransaction(() =>
      this.receipts.findExisting(this.dataSource.manager, identity, intent)
    );
  }

  private async requireStorageUse(
    request: DataMartExecutionRequest,
    storageId: string | undefined,
    stored: boolean
  ): Promise<void> {
    if (!storageId) throw new NotFoundException('Data Mart storage not found');
    const method = stored ? 'canAccessStored' : 'canAccess';
    if (
      !(await this.access[method](
        request.userId,
        request.roles,
        EntityType.STORAGE,
        storageId,
        Action.USE,
        request.projectId
      ))
    )
      throw new ForbiddenException('You do not have permission to use this Storage');
  }

  private precondition(request: DataMartExecutionRequest & { expectedRevision: number }): void {
    this.assertActor(request);
    if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 1)
      throw new BadRequestException('A current Data Mart configuration revision is required');
  }

  private operation(operationId: string | undefined): void {
    if (!operationId?.trim() || operationId.length > 128)
      throw new BadRequestException('A bounded operationId is required');
  }

  private connector(mart: {
    definitionType?: DataMartDefinitionType | null;
    status: DataMartStatus;
  }): void {
    if (
      mart.definitionType !== DataMartDefinitionType.CONNECTOR ||
      mart.status !== DataMartStatus.PUBLISHED
    )
      throw new BadRequestException(
        'Only published Connector Data Marts support loads and load schedules'
      );
  }

  private identity(request: DataMartExecutionRequest, action: string, resourceId: string) {
    return { projectId: request.projectId, userId: request.userId, action, resourceId };
  }

  private recover(
    request: DataMartExecutionRequest,
    receipt: MutationReceipt
  ): DataMartExecutionMutationDto {
    return this.result(
      request,
      receipt.result ?? { resourceId: request.dataMartId },
      receipt.status === 'completed'
        ? 'Recovered the committed outcome without repeating its effect.'
        : 'Operation has no verified completed outcome; do not enqueue it again.',
      receipt.status
    );
  }

  private result(
    request: DataMartExecutionRequest,
    reference: {
      resourceId: string;
      revision?: number;
      runId?: string;
      triggerId?: string;
      deleted?: boolean;
    },
    effect: string,
    outcome: DataMartExecutionMutationDto['outcome'] = 'completed'
  ): DataMartExecutionMutationDto {
    return {
      dataMartId: request.dataMartId,
      ...reference,
      revision: reference.revision ?? 0,
      revisionAggregate: 'data-mart-configuration',
      outcome,
      effect,
    };
  }

  private async requireExecutionAction(
    request: DataMartExecutionRequest,
    action: Action
  ): Promise<void> {
    if (
      !(await this.access.canAccess(
        request.userId,
        request.roles,
        EntityType.DATA_MART,
        request.dataMartId,
        action,
        request.projectId
      ))
    )
      throw new ForbiddenException('You do not have permission for this Data Mart action');
  }

  private assertActor(actor: DataMartExecutionActor): void {
    if (!actor.userId?.trim() || !actor.projectId?.trim())
      throw new UnauthorizedException('Setup actor is required');
    if (!actor.roles?.some(role => role === 'admin' || role === 'editor'))
      throw new ForbiddenException('Setup requires an admin or editor');
  }

  private async requireDataMart(request: DataMartExecutionRequest) {
    this.assertActor(request);
    const mart = await this.marts.getByIdAndProjectId(request.dataMartId, request.projectId);
    if (mart.projectId !== request.projectId || mart.id !== request.dataMartId)
      throw new NotFoundException('Data Mart not found');
    return mart;
  }

  private async scopedRun(request: DataMartExecutionRunRequest) {
    await this.requireDataMart(request);
    const run = await this.runs.getByIdAndDataMartId(request.runId, request.dataMartId);
    if (!run || run.id !== request.runId || run.dataMartId !== request.dataMartId)
      throw new NotFoundException('Data Mart run not found');
    return run;
  }

  private async requireAction(request: DataMartExecutionRequest, action: Action): Promise<void> {
    if (
      !(await this.access.canAccessStored(
        request.userId,
        request.roles,
        EntityType.DATA_MART,
        request.dataMartId,
        action,
        request.projectId
      ))
    )
      throw new ForbiddenException('You do not have permission for this Data Mart action');
  }
}
