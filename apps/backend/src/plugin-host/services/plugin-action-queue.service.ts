import { Injectable, Logger } from '@nestjs/common';
import { castError } from '@owox/internal-helpers';
import { GracefulShutdownService } from '../../common/scheduler/services/graceful-shutdown.service';
import type { ProjectMemberDto } from '../../idp/dto/domain/project-member.dto';
import type { PluginActionExecution } from '../entities/plugin-action-execution.entity';
import { PluginScheduleDisabledReason } from '../enums/plugin-action-schedule.enum';
import { TooManyExecutionsError } from '../errors/plugin-action.errors';
import { createExecutionToken } from '../utils/execution-token.util';
import { resolveBackendUrl } from '../utils/plugin-manifest.util';
import { ActionInputValidatorService, isOverBudget } from './action-input-validator.service';
import { PluginActionDispatcherService } from './plugin-action-dispatcher.service';
import { PluginActionExecutionService } from './plugin-action-execution.service';
import { PluginActionScheduleService } from './plugin-action-schedule.service';
import { PluginInstallationService } from './plugin-installation.service';
import { PluginOwnerMembershipService } from './plugin-owner-membership.service';
import { PluginVersionService } from './plugin-version.service';
import { PluginService } from './plugin.service';

/** What the checks outside a transaction decide for a queued execution. */
type QueuedVerdict =
  | {
      readonly kind: 'start';
      readonly backendUrl: string;
      readonly pluginVersionId: string;
      readonly role: string;
      readonly timeoutSeconds: number;
    }
  | {
      readonly kind: 'fail';
      readonly code: string;
      readonly message: string;
      /** The reason the schedule handler disables a schedule for on the same verdict. */
      readonly disables: PluginScheduleDisabledReason | null;
    }
  | { readonly kind: 'wait'; readonly reason: string };

function fail(
  code: string,
  message: string,
  disables: PluginScheduleDisabledReason | null = null
): QueuedVerdict {
  return { kind: 'fail', code, message, disables };
}

/** Starts queued executions as slots free up; the IDP and validator checks run outside any transaction. */
@Injectable()
export class PluginActionQueueService {
  private readonly logger = new Logger(PluginActionQueueService.name);

  constructor(
    private readonly executions: PluginActionExecutionService,
    private readonly schedules: PluginActionScheduleService,
    private readonly dispatcher: PluginActionDispatcherService,
    private readonly installations: PluginInstallationService,
    private readonly plugins: PluginService,
    private readonly versions: PluginVersionService,
    private readonly validator: ActionInputValidatorService,
    private readonly owners: PluginOwnerMembershipService,
    private readonly shutdown: GracefulShutdownService
  ) {}

  /** Dispatches a RUNNING execution and promotes the installation's queue once the dispatch settles. Never rejects. */
  dispatchAndPromote(
    execution: PluginActionExecution,
    backendUrl: string,
    token: string,
    timeoutSeconds: number
  ): void {
    // dispatch never rejects, and a cancel, a timeout and an answer all settle it.
    void this.dispatcher
      .dispatch(execution, backendUrl, token, timeoutSeconds)
      .then(() => this.promote(execution.installationId));
  }

  /** Starts queued executions of the installation while slots allow; never rejects. */
  async promote(installationId: string): Promise<void> {
    // A row started on an exiting replica would only time out; a live replica's sweep starts it.
    if (this.shutdown.isInShutdownMode()) return;
    try {
      let more = true;
      while (more) {
        more = await this.promoteOldest(installationId);
      }
    } catch (error) {
      this.logger.error(
        `Plugin action queue stopped installationId=${installationId}`,
        castError(error).stack
      );
    }
  }

  /** False once nothing more can start now. */
  private async promoteOldest(installationId: string): Promise<boolean> {
    const execution = await this.executions.findOldestQueued(installationId);
    if (!execution) return false;
    // Unlocked: promote counts again under its lock.
    if (await this.executions.refusesStart(installationId)) return false;

    const verdict = await this.check(execution);
    if (verdict.kind === 'wait') {
      this.logger.warn(
        `Plugin action stays queued executionId=${execution.id} reason=${verdict.reason}`
      );
      return false;
    }
    if (verdict.kind === 'fail') {
      const { scheduleId } = execution;
      if (verdict.disables && scheduleId !== null) {
        const disabled = await this.schedules.failQueuedAndDisable(
          { id: execution.id, installationId, scheduleId },
          verdict.code,
          verdict.message,
          verdict.disables
        );
        if (disabled) {
          this.logger.log(
            `Plugin schedule disabled scheduleId=${scheduleId} executionId=${execution.id} reason=${verdict.disables}`
          );
        }
      } else {
        await this.executions.failQueued(execution.id, verdict.code, verdict.message);
      }
      this.logger.log(
        `Plugin action failed in the queue executionId=${execution.id} errorCode=${verdict.code}`
      );
      return true;
    }

    const { token, tokenHash } = createExecutionToken();
    const promoted = await this.executions.promote({
      id: execution.id,
      installationId,
      pluginVersionId: verdict.pluginVersionId,
      role: verdict.role,
      tokenHash,
      timeoutSeconds: verdict.timeoutSeconds,
    });
    if (promoted.outcome === 'WAIT') return false;
    if (promoted.outcome === 'STARTED') {
      this.logger.log(
        `Plugin action promoted executionId=${execution.id} action=${execution.action}`
      );
      this.dispatchAndPromote(
        promoted.execution,
        verdict.backendUrl,
        token,
        verdict.timeoutSeconds
      );
    }
    return true;
  }

  private async check(execution: PluginActionExecution): Promise<QueuedVerdict> {
    const installation = await this.installations.findById(execution.installationId);
    if (!installation || installation.uninstalledAt !== null) {
      return fail('INSTALLATION_INACTIVE', 'The plugin installation is no longer active');
    }
    const plugin = await this.plugins.findById(execution.pluginId);
    if (plugin?.suspendedAt) {
      return fail('PLUGIN_SUSPENDED', 'This plugin is temporarily unavailable');
    }
    const version = plugin?.currentVersionId
      ? await this.versions.findById(plugin.currentVersionId)
      : null;
    // An own property only, as the starter checks it.
    if (!version?.backend || !Object.hasOwn(version.backend.actions, execution.action)) {
      return fail(
        'ACTION_NOT_DECLARED',
        `Action "${execution.action}" is not declared in the current version of this plugin`,
        PluginScheduleDisabledReason.ACTION_NOT_DECLARED
      );
    }
    const declaration = version.backend.actions[execution.action];
    if (declaration.input) {
      try {
        const errors = await this.validator.validate(
          version.id,
          execution.action,
          declaration.input,
          execution.input
        );
        if (isOverBudget(errors)) return { kind: 'wait', reason: 'VALIDATION_OVER_BUDGET' };
        if (errors.length > 0) {
          return fail(
            'INVALID_INPUT',
            'Action input does not match the action schema',
            PluginScheduleDisabledReason.INVALID_PARAMETERS
          );
        }
      } catch (error) {
        if (error instanceof TooManyExecutionsError)
          return { kind: 'wait', reason: 'VALIDATION_BUSY' };
        throw error;
      }
    }

    let member: ProjectMemberDto | null;
    try {
      member = await this.owners.activeMember(installation.projectId, installation.userId);
    } catch (error) {
      this.logger.warn(
        `Plugin action owner check failed executionId=${execution.id} projectId=${installation.projectId}: ${castError(error).message}`
      );
      return { kind: 'wait', reason: 'IDP_UNAVAILABLE' };
    }
    if (!member) {
      return fail(
        'OWNER_NOT_MEMBER',
        'The installation owner is no longer a project member, or their account is locked'
      );
    }
    return {
      kind: 'start',
      backendUrl: resolveBackendUrl(version.backend, version.deliveryUrl),
      pluginVersionId: version.id,
      role: member.role,
      timeoutSeconds: declaration.timeoutSeconds,
    };
  }
}
