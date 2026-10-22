import { ForbiddenException } from '@nestjs/common';
import type { AuthorizationContext } from '../../idp/types/auth.types';
import type { PluginScheduleOwner } from '../dto/domain/plugin-action-schedule.dto';
import { ExecutionTokenNotAllowedError } from '../errors/plugin-action.errors';

/** The runtime schedule routes: the installation is the token's, and only the plugin page may write. */
export function ownerOf(context: AuthorizationContext): PluginScheduleOwner {
  if (!context.pluginId || !context.installationId) {
    throw new ForbiddenException('Plugin runtime authentication is required');
  }
  return {
    installationId: context.installationId,
    pluginId: context.pluginId,
    projectId: context.projectId,
  };
}

export function writerOf(context: AuthorizationContext): PluginScheduleOwner {
  if (context.executionId) {
    throw new ExecutionTokenNotAllowedError('A backend action cannot change schedules');
  }
  return ownerOf(context);
}
