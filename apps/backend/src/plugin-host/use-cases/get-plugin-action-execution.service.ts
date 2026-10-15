import { Injectable } from '@nestjs/common';
import { PLUGIN_ACTION_LIMITS } from '../constants/plugin-action-limits';
import { GetPluginActionExecutionCommand } from '../dto/domain/plugin-action-execution.command';
import type { PluginActionExecutionView } from '../dto/domain/plugin-action-execution.dto';
import {
  isFinalPluginActionStatus,
  PluginActionExecutionStatus,
} from '../enums/plugin-action-execution-status.enum';
import { ExecutionNotFoundError } from '../errors/plugin-action.errors';
import { toPluginActionExecutionView } from '../mappers/plugin-action-execution.mapper';
import {
  PluginActionExecutionService,
  type PluginActionExecutionSummary,
} from '../services/plugin-action-execution.service';

/** The wait polls the status because the outcome may be written on another replica. */
@Injectable()
export class GetPluginActionExecutionService {
  constructor(private readonly executions: PluginActionExecutionService) {}

  async run(command: GetPluginActionExecutionCommand): Promise<PluginActionExecutionView> {
    const waitUntil = Date.now() + command.waitSeconds * 1000;
    const execution = await this.find(command);
    let status: PluginActionExecutionStatus | null = execution.status;
    let polled = false;
    while (status !== null && !isFinalPluginActionStatus(status)) {
      const remaining = waitUntil - Date.now();
      if (remaining <= 0 || command.signal.aborted) break;
      await pause(Math.min(PLUGIN_ACTION_LIMITS.waitPollMs, remaining), command.signal);
      if (command.signal.aborted) break;
      status = await this.executions.findStatus(command.id);
      polled = true;
    }
    return toPluginActionExecutionView(polled ? await this.find(command) : execution);
  }

  private async find(
    command: GetPluginActionExecutionCommand
  ): Promise<PluginActionExecutionSummary> {
    const execution = await this.executions.findById(command.id);
    // Another installation's execution is answered exactly like a missing one.
    if (!execution || execution.installationId !== command.context.installationId) {
      throw new ExecutionNotFoundError();
    }
    return execution;
  }
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const elapsed = new AbortController();
    const timer = setTimeout(() => {
      elapsed.abort();
      resolve();
    }, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true, signal: elapsed.signal }
    );
  });
}
