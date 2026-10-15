import { Injectable, Logger } from '@nestjs/common';
import { castError } from '@owox/internal-helpers';
import { withGuardedDispatcher } from '../../common/helpers/guarded-dispatcher';
import { readBoundedBody } from '../../common/helpers/read-bounded-body.helper';
import { assertPublicHttpUrl, UnsafeUrlError } from '../../common/helpers/safe-url.helper';
import { GracefulShutdownService } from '../../common/scheduler/services/graceful-shutdown.service';
import { PluginHostConfigService } from '../config/plugin-host.config';
import { PLUGIN_ACTION_LIMITS } from '../constants/plugin-action-limits';
import type { PluginActionExecution } from '../entities/plugin-action-execution.entity';
import { PluginActionExecutionStatus } from '../enums/plugin-action-execution-status.enum';
import { classifyBackendResponse } from '../utils/plugin-action-outcome.util';
import {
  type FinishExecutionInput,
  PluginActionExecutionService,
} from './plugin-action-execution.service';

/** Room for the `{"result": …}` envelope around a result of the largest allowed size. */
const MAX_RESPONSE_BYTES = PLUGIN_ACTION_LIMITS.maxResultBytes + 1024;

const UNSTORABLE_RESULT: FinishExecutionInput = {
  status: PluginActionExecutionStatus.FAILED,
  errorCode: 'BACKEND_INVALID_RESPONSE',
  errorMessage: 'The result could not be stored',
};

type StopReason = 'deadline' | 'ended';

/** No retries: an action may have side effects, and only its author knows a second call is safe. */
@Injectable()
export class PluginActionDispatcherService {
  private readonly logger = new Logger(PluginActionDispatcherService.name);

  constructor(
    private readonly executions: PluginActionExecutionService,
    private readonly shutdown: GracefulShutdownService,
    private readonly config: PluginHostConfigService
  ) {}

  async dispatch(
    execution: PluginActionExecution,
    backendUrl: string,
    token: string,
    timeoutSeconds: number
  ): Promise<void> {
    const processId = this.shutdown.registerActiveProcess(`plugin-action-${execution.id}`);
    const startedAt = Date.now();
    const controller = new AbortController();
    let stopReason: StopReason | undefined;
    const stop = (reason: StopReason) => {
      stopReason ??= reason;
      controller.abort();
    };
    const deadline = setTimeout(
      () => stop('deadline'),
      Math.max(0, (execution.deadlineAt?.getTime() ?? startedAt) - startedAt)
    );
    // A cancel may land on another replica, so the row is the only place to learn of it.
    const poll = setInterval(() => {
      this.executions.findStatus(execution.id).then(
        status => {
          if (status !== PluginActionExecutionStatus.RUNNING) stop('ended');
        },
        () => undefined
      );
    }, PLUGIN_ACTION_LIMITS.cancelPollMs);

    try {
      let outcome: FinishExecutionInput | null;
      try {
        outcome = await this.call(execution.id, backendUrl, token, controller.signal);
      } catch (error) {
        outcome =
          stopReason === 'deadline'
            ? timedOut(timeoutSeconds)
            : stopReason === 'ended'
              ? null
              : unreachable(error);
      } finally {
        clearTimeout(deadline);
        clearInterval(poll);
      }

      let recorded = false;
      if (outcome) {
        try {
          recorded = await this.executions.finish(execution.id, outcome);
        } catch (error) {
          if (outcome.status !== PluginActionExecutionStatus.SUCCEEDED) throw error;
          // Left RUNNING, the result would be lost and the row would read as running until the sweep times it out.
          this.logger.error(
            `Plugin action ${execution.id} could not store its result`,
            castError(error).stack
          );
          outcome = UNSTORABLE_RESULT;
          recorded = await this.executions.finish(execution.id, outcome);
        }
      }
      const status =
        recorded && outcome ? outcome.status : await this.executions.findStatus(execution.id);
      const errorCode =
        recorded && outcome?.status === PluginActionExecutionStatus.FAILED
          ? outcome.errorCode
          : '-';
      this.logger.log(
        `Plugin action finished executionId=${execution.id} action=${execution.action} status=${status} errorCode=${errorCode} durationMs=${Date.now() - startedAt}`
      );
    } catch (error) {
      this.logger.error(
        `Plugin action ${execution.id} could not record its outcome`,
        castError(error).stack
      );
    } finally {
      this.shutdown.unregisterActiveProcess(processId);
    }
  }

  private async call(
    executionId: string,
    backendUrl: string,
    token: string,
    signal: AbortSignal
  ): Promise<FinishExecutionInput> {
    await assertPublicHttpUrl(backendUrl, { allowedProtocols: ['https:'] });
    const response = await fetch(
      backendUrl,
      withGuardedDispatcher({
        method: 'POST',
        // 'error' would make a redirect indistinguishable from a network failure.
        redirect: 'manual',
        signal,
        headers: { 'content-type': 'application/json', 'x-owox-execution-token': token },
        body: JSON.stringify({ owox: 1, host: this.config.publicOrigin, executionId }),
      })
    );
    const body = await readBoundedBody(response, MAX_RESPONSE_BYTES);
    return classifyBackendResponse(response.status, body?.toString('utf8') ?? null);
  }
}

function timedOut(seconds: number): FinishExecutionInput {
  return {
    status: PluginActionExecutionStatus.TIMED_OUT,
    errorMessage: `The action did not finish within ${seconds} s`,
  };
}

function unreachable(error: unknown): FinishExecutionInput {
  return {
    status: PluginActionExecutionStatus.FAILED,
    errorCode: 'BACKEND_UNREACHABLE',
    errorMessage: `The backend could not be reached (${reasonOf(error)})`,
  };
}

function reasonOf(error: unknown): string {
  if (error instanceof UnsafeUrlError) return error.reason;
  const { cause, name } = castError(error);
  const code = (cause as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' ? code : name;
}
