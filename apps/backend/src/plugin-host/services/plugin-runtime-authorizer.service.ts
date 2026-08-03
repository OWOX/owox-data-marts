import { Inject, Injectable } from '@nestjs/common';
import { AuthorizationError } from '@owox/idp-protocol';
import {
  PluginRuntimeAuthorizerPort,
  PluginRuntimeIdentity,
} from '../../idp/ports/plugin-runtime-authorizer.port';
import {
  PLUGIN_INSTALLATION_LOOKUP,
  PluginInstallationLookupPort,
} from '../facades/plugin-installation-lookup.facade';

@Injectable()
export class PluginRuntimeAuthorizerService implements PluginRuntimeAuthorizerPort {
  constructor(
    @Inject(PLUGIN_INSTALLATION_LOOKUP)
    private readonly installations: PluginInstallationLookupPort
  ) {}

  async assertActiveInstallation(identity: PluginRuntimeIdentity): Promise<void> {
    const installation = await this.installations.findSnapshot(identity.installationId);

    if (
      !installation ||
      !installation.isActive ||
      installation.isSuspended ||
      installation.pluginId !== identity.pluginId ||
      installation.projectId !== identity.projectId ||
      installation.userId !== identity.userId
    ) {
      throw new AuthorizationError('Plugin runtime access denied');
    }
  }
}
