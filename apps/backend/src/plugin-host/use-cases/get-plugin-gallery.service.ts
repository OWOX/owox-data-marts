import { Injectable } from '@nestjs/common';
import { GetPluginGalleryCommand } from '../dto/domain/get-plugin-gallery.command';
import { PluginGalleryEntryDto, PluginInstallationState } from '../dto/domain/plugin-view.dto';
import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';
import { PluginPresentationMapper } from '../mappers/plugin-presentation.mapper';
import { PluginInstallationService } from '../services/plugin-installation.service';
import { PluginPublicationService } from '../services/plugin-publication.service';
import { PluginVersionService } from '../services/plugin-version.service';
import { PluginService } from '../services/plugin.service';

/**
 * The combined Gallery for one member in one project.
 *
 * Deployment, project and member publications are independent and are merged, not
 * ranked: a plugin exposed by all three appears once, listing all three as reasons it
 * is visible. Nothing substitutes for anything else.
 */
@Injectable()
export class GetPluginGalleryService {
  constructor(
    private readonly publications: PluginPublicationService,
    private readonly installations: PluginInstallationService,
    private readonly pluginService: PluginService,
    private readonly versionService: PluginVersionService,
    private readonly mapper: PluginPresentationMapper
  ) {}

  async run(command: GetPluginGalleryCommand): Promise<PluginGalleryEntryDto[]> {
    const { context } = command;
    const visible = await this.publications.findVisibleTo(context.projectId, context.userId);

    const scopesByPlugin = new Map<string, Set<PluginPublicationScope>>();
    for (const publication of visible) {
      const scopes = scopesByPlugin.get(publication.pluginId) ?? new Set();
      scopes.add(publication.scope);
      scopesByPlugin.set(publication.pluginId, scopes);
    }

    // One query for the member's whole history rather than one per entry: the Gallery
    // is a list, and a per-row lookup would scale with it for no reason.
    const installations = await this.installations.findByMember(context.projectId, context.userId);
    const stateByPlugin = new Map<string, PluginInstallationState>(
      installations.map(row => [
        row.pluginId,
        row.uninstalledAt === null ? 'installed' : 'uninstalled',
      ])
    );

    const entries = await Promise.all(
      [...scopesByPlugin].map(([pluginId, scopes]) =>
        this.toEntry(pluginId, [...scopes], stateByPlugin.get(pluginId) ?? 'not_installed')
      )
    );

    return entries.filter((entry): entry is PluginGalleryEntryDto => entry !== null);
  }

  private async toEntry(
    pluginId: string,
    scopes: PluginPublicationScope[],
    installationState: PluginInstallationState
  ): Promise<PluginGalleryEntryDto | null> {
    const plugin = await this.pluginService.findById(pluginId);
    if (!plugin) {
      // A publication with no plugin behind it should be impossible, but one broken row
      // must not take down a member's whole Gallery.
      return null;
    }

    const version = plugin.currentVersionId
      ? await this.versionService.findById(plugin.currentVersionId)
      : null;

    return this.mapper.toMemberDto(plugin, version, { scopes, installationState });
  }
}
