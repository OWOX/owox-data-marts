import { Injectable } from '@nestjs/common';
import { PluginInstallationService } from '../services/plugin-installation.service';
import { PluginService } from '../services/plugin.service';
import {
  PluginInstallationLookupPort,
  PluginInstallationSnapshot,
} from './plugin-installation-lookup.facade';

@Injectable()
export class PluginInstallationLookupFacade implements PluginInstallationLookupPort {
  constructor(
    private readonly installations: PluginInstallationService,
    private readonly plugins: PluginService
  ) {}

  async findSnapshot(installationId: string): Promise<PluginInstallationSnapshot | null> {
    const installation = await this.installations.findById(installationId);
    if (!installation) {
      return null;
    }

    const plugin = await this.plugins.findById(installation.pluginId);

    return {
      installationId: installation.id,
      pluginId: installation.pluginId,
      projectId: installation.projectId,
      userId: installation.userId,
      isActive: installation.uninstalledAt === null,
      // A missing plugin record counts as suspended rather than healthy: the caller uses
      // this to decide whether to let a plugin act, so the unknown case must fail closed.
      isSuspended: plugin ? plugin.suspendedAt !== null : true,
    };
  }
}
