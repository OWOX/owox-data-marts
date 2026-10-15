import { Inject, Injectable } from '@nestjs/common';
import { AuthorizationError, RoleEnum } from '@owox/idp-protocol';
import {
  PluginExecutionIdentity,
  PluginRuntimeAuthorizerPort,
  PluginRuntimeIdentity,
} from '../../idp/ports/plugin-runtime-authorizer.port';
import {
  PLUGIN_INSTALLATION_LOOKUP,
  PluginInstallationLookupPort,
} from '../facades/plugin-installation-lookup.facade';
import { PluginSuspendedError } from '../errors/plugin-host.errors';
import { hashExecutionToken } from '../utils/execution-token.util';
import { PluginActionExecutionService } from './plugin-action-execution.service';

@Injectable()
export class PluginRuntimeAuthorizerService implements PluginRuntimeAuthorizerPort {
  constructor(
    @Inject(PLUGIN_INSTALLATION_LOOKUP)
    private readonly installations: PluginInstallationLookupPort,
    private readonly executions: PluginActionExecutionService
  ) {}

  async assertActiveInstallation(identity: PluginRuntimeIdentity): Promise<void> {
    const installation = await this.installations.findSnapshot(identity.installationId);

    if (
      !installation ||
      !installation.isActive ||
      installation.pluginId !== identity.pluginId ||
      installation.projectId !== identity.projectId ||
      installation.userId !== identity.userId
    ) {
      throw new AuthorizationError('Plugin runtime access denied');
    }
    if (installation.isSuspended) {
      throw new PluginSuspendedError(installation.pluginId);
    }
  }

  async resolveExecutionToken(token: string): Promise<PluginExecutionIdentity | null> {
    if (!token) {
      return null;
    }

    const execution = await this.executions.findRunningByTokenHash(
      hashExecutionToken(token),
      new Date()
    );
    if (!execution) {
      return null;
    }

    const role = RoleEnum.safeParse(execution.role);
    if (!role.success) {
      return null;
    }

    return {
      executionId: execution.id,
      pluginId: execution.pluginId,
      installationId: execution.installationId,
      projectId: execution.projectId,
      userId: execution.userId,
      role: role.data,
    };
  }
}
