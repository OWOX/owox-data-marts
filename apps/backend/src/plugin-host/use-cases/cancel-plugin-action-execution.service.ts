import { Injectable } from '@nestjs/common';
import { CancelPluginActionExecutionCommand } from '../dto/domain/plugin-action-execution.command';
import type { PluginActionExecutionView } from '../dto/domain/plugin-action-execution.dto';
import { ExecutionNotFoundError } from '../errors/plugin-action.errors';
import { toPluginActionExecutionView } from '../mappers/plugin-action-execution.mapper';
import { PluginActionExecutionService } from '../services/plugin-action-execution.service';

/** Idempotent: a finished execution is answered as it is, so the host can cancel blindly on close. */
@Injectable()
export class CancelPluginActionExecutionService {
  constructor(private readonly executions: PluginActionExecutionService) {}

  async run(command: CancelPluginActionExecutionCommand): Promise<PluginActionExecutionView> {
    const installationId = command.context.installationId;
    if (installationId) {
      await this.executions.cancel(command.id, installationId);
    }

    const execution = await this.executions.findById(command.id);
    if (!execution || execution.installationId !== installationId) {
      throw new ExecutionNotFoundError();
    }
    return toPluginActionExecutionView(execution);
  }
}
