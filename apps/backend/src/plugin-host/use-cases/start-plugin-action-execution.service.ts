import { ForbiddenException, Injectable } from '@nestjs/common';
import { StartPluginActionExecutionCommand } from '../dto/domain/plugin-action-execution.command';
import type { StartedPluginActionExecution } from '../dto/domain/plugin-action-execution.dto';
import {
  ActionNotDeclaredError,
  ExecutionTokenNotAllowedError,
} from '../errors/plugin-action.errors';
import { PluginActionStarterService } from '../services/plugin-action-starter.service';
import { PluginVersionService } from '../services/plugin-version.service';
import { PluginService } from '../services/plugin.service';

/** A start from the plugin page: the runtime token names the installation and the caller's role. */
@Injectable()
export class StartPluginActionExecutionService {
  constructor(
    private readonly plugins: PluginService,
    private readonly versions: PluginVersionService,
    private readonly starter: PluginActionStarterService
  ) {}

  async run(command: StartPluginActionExecutionCommand): Promise<StartedPluginActionExecution> {
    const { context, action } = command;
    if (context.executionId) {
      throw new ExecutionTokenNotAllowedError();
    }
    const role = context.roles?.[0];
    if (!context.pluginId || !context.installationId || !role) {
      throw new ForbiddenException('Plugin runtime authentication is required');
    }

    const plugin = await this.plugins.findById(context.pluginId);
    const version = plugin?.currentVersionId
      ? await this.versions.findById(plugin.currentVersionId)
      : null;
    if (!version) {
      throw new ActionNotDeclaredError(action);
    }

    return this.starter.start({
      installation: {
        id: context.installationId,
        projectId: context.projectId,
        userId: context.userId,
      },
      version,
      action,
      input: command.input,
      role,
      trigger: 'frontend',
    });
  }
}
