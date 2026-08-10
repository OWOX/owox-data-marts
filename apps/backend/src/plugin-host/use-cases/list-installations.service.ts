import { Injectable } from '@nestjs/common';
import { ListInstallationsCommand } from '../dto/domain/list-installations.command';
import { InstalledPluginDto } from '../dto/domain/plugin-installation.dto';
import { PluginPresentationMapper } from '../mappers/plugin-presentation.mapper';
import { PluginInstallationService } from '../services/plugin-installation.service';
import { PluginVersionService } from '../services/plugin-version.service';
import { PluginService } from '../services/plugin.service';

/**
 * A member's installation history.
 *
 * History is not a convenience listing: it is the only surface from which a member can
 * restore a plugin whose publication has since been withdrawn, because such a plugin no
 * longer appears in the Gallery at all.
 */
@Injectable()
export class ListInstallationsService {
  constructor(
    private readonly installations: PluginInstallationService,
    private readonly pluginService: PluginService,
    private readonly versionService: PluginVersionService,
    private readonly mapper: PluginPresentationMapper
  ) {}

  async run(command: ListInstallationsCommand): Promise<InstalledPluginDto[]> {
    const rows = await this.installations.findByMember(
      command.context.projectId,
      command.context.userId
    );
    const visible = command.includeUninstalled
      ? rows
      : rows.filter(row => row.uninstalledAt === null);

    // Two bulk reads rather than two per row: this list grows with a member's history.
    const plugins = await this.pluginService.findByIds(visible.map(row => row.pluginId));
    const pluginById = new Map(plugins.map(plugin => [plugin.id, plugin]));
    const versions = await this.versionService.findByIds(
      plugins.map(plugin => plugin.currentVersionId).filter(id => id !== null)
    );
    const versionById = new Map(versions.map(version => [version.id, version]));

    const entries: InstalledPluginDto[] = [];
    for (const row of visible) {
      const plugin = pluginById.get(row.pluginId);
      if (!plugin) {
        continue;
      }

      entries.push({
        ...this.mapper.toMemberDto(
          plugin,
          plugin.currentVersionId ? (versionById.get(plugin.currentVersionId) ?? null) : null,
          {
            scopes: [],
            installationState: row.uninstalledAt === null ? 'installed' : 'uninstalled',
          }
        ),
        installationId: row.id,
        installedAt: row.installedAt,
        uninstalledAt: row.uninstalledAt,
      });
    }

    return entries;
  }
}
