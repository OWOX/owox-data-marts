import { Injectable } from '@nestjs/common';
import { PublicOriginService } from '../../common/config/public-origin.service';
import type {
  McpPluginConfigurationDto,
  McpPluginSummaryDto,
  McpPluginUpdateDto,
} from '../dto/domain/mcp-plugin-setup.dto';
import type { PluginGalleryEntryDto } from '../dto/domain/plugin-view.dto';
import type { PluginUpdateResultDto } from '../dto/domain/update-plugin.command';

@Injectable()
export class McpPluginSetupMapper {
  constructor(private readonly publicOrigin: PublicOriginService) {}

  summary(projectId: string, plugin: PluginGalleryEntryDto): McpPluginSummaryDto {
    return {
      pluginId: plugin.pluginId,
      displayName: plugin.displayName,
      description: plugin.description,
      currentVersionId: plugin.currentVersionId,
      currentSemver: plugin.currentSemver,
      installationState: plugin.installationState,
      suspended: plugin.suspended,
      detailsUrl: this.appUrl(projectId, plugin.pluginId),
    };
  }

  configuration(projectId: string, plugin: PluginGalleryEntryDto): McpPluginConfigurationDto {
    const canOpen =
      plugin.installationState === 'installed' &&
      !plugin.suspended &&
      plugin.currentVersionId !== null;
    return {
      pluginId: plugin.pluginId,
      mode: 'app',
      verification: 'unknown',
      appUrl: this.appUrl(projectId, plugin.pluginId, canOpen),
      manualStep: canOpen
        ? 'Open the Plugin and complete its settings in the app. The Host has no typed configuration contract and cannot verify this step.'
        : 'Open the Plugin details in the app to resolve installation, credentials or suspension before completing Plugin settings.',
    };
  }

  update(result: PluginUpdateResultDto): McpPluginUpdateDto {
    return {
      pluginId: result.pluginId,
      currentVersionId: result.currentVersionId,
      currentSemver: result.currentSemver,
      outcome: result.outcome,
      nextCheckAt: result.nextCheckAt,
      sharedDeploymentEffect: true,
      effect:
        'This managed check may activate a newer shared version for all installations in every project. It does not lift suspension or select a personal version.',
    };
  }

  private appUrl(projectId: string, pluginId: string, open = false): string {
    return new URL(
      `/ui/${encodeURIComponent(projectId)}/plugins/${encodeURIComponent(pluginId)}${open ? '/open' : ''}`,
      this.publicOrigin.getPublicOrigin()
    ).toString();
  }
}
