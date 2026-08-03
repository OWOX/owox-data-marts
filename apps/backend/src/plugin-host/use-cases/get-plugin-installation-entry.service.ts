import { Injectable, NotFoundException } from '@nestjs/common';
import { GetPluginInstallationEntryCommand } from '../dto/domain/get-plugin-installation-entry.command';
import { PluginInstallationEntryDto } from '../dto/domain/plugin-installation.dto';
import { PluginSuspendedError } from '../errors/plugin-host.errors';
import { PluginInstallationService } from '../services/plugin-installation.service';
import { PluginVersionService } from '../services/plugin-version.service';
import { PluginService } from '../services/plugin.service';

/**
 * The delivery URL for one active installation.
 *
 * The single member-facing place a delivery URL is returned, and only for the caller's
 * own live installation. It is a runtime bootstrap rather than a product view: the
 * host has to know what to point the iframe at, and the URL is visible in the browser
 * regardless. Everything else member-facing still withholds it.
 */
@Injectable()
export class GetPluginInstallationEntryService {
  constructor(
    private readonly installations: PluginInstallationService,
    private readonly pluginService: PluginService,
    private readonly versionService: PluginVersionService
  ) {}

  async run(command: GetPluginInstallationEntryCommand): Promise<PluginInstallationEntryDto> {
    const installation = await this.installations.findById(command.installationId);

    // One 404 for every way of not being entitled to it: confirming that an
    // installation exists but belongs to someone else is itself a disclosure.
    if (
      !installation ||
      installation.userId !== command.context.userId ||
      installation.projectId !== command.context.projectId ||
      installation.uninstalledAt !== null
    ) {
      throw new NotFoundException('No active installation was found');
    }

    const plugin = await this.pluginService.findById(installation.pluginId);
    if (!plugin || !plugin.currentVersionId) {
      throw new NotFoundException('No active installation was found');
    }

    if (plugin.suspendedAt !== null) {
      throw new PluginSuspendedError(plugin.id);
    }

    const version = await this.versionService.findById(plugin.currentVersionId);
    if (!version) {
      throw new NotFoundException('No active installation was found');
    }

    return {
      deliveryUrl: version.deliveryUrl,
      displayName: version.displayName,
      pluginId: plugin.id,
      versionId: version.id,
    };
  }
}
