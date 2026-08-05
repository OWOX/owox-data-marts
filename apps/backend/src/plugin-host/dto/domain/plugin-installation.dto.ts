import { PluginGalleryEntryDto } from './plugin-view.dto';

export interface PluginInstallationDto {
  readonly installationId: string;
  readonly pluginId: string;
  readonly createdAt: Date;
  readonly installedAt: Date;
  readonly uninstalledAt: Date | null;
}

export interface InstalledPluginDto extends PluginGalleryEntryDto {
  readonly installationId: string;
  readonly installedAt: Date;
  readonly uninstalledAt: Date | null;
}

export interface PluginInstallationEntryDto {
  readonly deliveryUrl: string;
  readonly displayName: string;
  /** Stable across renames, transfers and every release -- what a plugin may key on. */
  readonly pluginId: string;
  readonly versionId: string;
}
