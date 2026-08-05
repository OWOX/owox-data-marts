import { Injectable, NotFoundException } from '@nestjs/common';
import { GetPluginDetailsCommand } from '../dto/domain/get-plugin-details.command';
import { PluginGalleryEntryDto, PluginInstallationState } from '../dto/domain/plugin-view.dto';
import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';
import { PluginPresentationMapper } from '../mappers/plugin-presentation.mapper';
import { PluginInstallationService } from '../services/plugin-installation.service';
import { PluginPublicationService } from '../services/plugin-publication.service';
import { PluginVersionService } from '../services/plugin-version.service';
import { PluginService } from '../services/plugin.service';

/**
 * One plugin, reached directly rather than through the Gallery.
 *
 * A direct link is an additional discovery path in its own right, so this deliberately
 * works with no publication at all -- a member handed a link can read the page and
 * install from it. What the scopes list conveys is only *why* it would also appear in
 * their Gallery, which may well be "no reason".
 */
@Injectable()
export class GetPluginDetailsService {
  constructor(
    private readonly pluginService: PluginService,
    private readonly versionService: PluginVersionService,
    private readonly publications: PluginPublicationService,
    private readonly installations: PluginInstallationService,
    private readonly mapper: PluginPresentationMapper
  ) {}

  async run(command: GetPluginDetailsCommand): Promise<PluginGalleryEntryDto> {
    const { pluginId, context } = command;
    const plugin = await this.pluginService.findById(pluginId);
    if (!plugin) {
      throw new NotFoundException(`Plugin ${pluginId} was not found`);
    }

    const version = plugin.currentVersionId
      ? await this.versionService.findById(plugin.currentVersionId)
      : null;

    const visible = await this.publications.findVisibleTo(context.projectId, context.userId);
    const scopes = [
      ...new Set(visible.filter(row => row.pluginId === pluginId).map(row => row.scope)),
    ] as PluginPublicationScope[];

    // Read, never assumed. This page is the only surface offering uninstall and update,
    // and it is the sole route to a plugin no publication lists any more -- reporting a
    // member's own installation as absent here strands them on it.
    const installation = await this.installations.findOne(
      pluginId,
      context.projectId,
      context.userId
    );

    return this.mapper.toMemberDto(plugin, version, {
      scopes,
      installationState: installationStateOf(installation),
    });
  }
}

function installationStateOf(
  installation: { uninstalledAt: Date | null } | null
): PluginInstallationState {
  if (!installation) {
    return 'not_installed';
  }

  return installation.uninstalledAt === null ? 'installed' : 'uninstalled';
}
