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

/** The Credential granted to each requirement now; an ungranted requirement is absent. */
export interface PluginCredentialSelectionsDto {
  readonly credentialSelections: Readonly<Record<string, string>>;
}

export interface PluginInstallationEntryDto {
  readonly deliveryUrl: string;
  readonly displayName: string;
  /** Stable across renames, transfers and every release -- what a plugin may key on. */
  readonly pluginId: string;
  readonly versionId: string;
  readonly credentialHandles: readonly PluginCredentialHandleDto[];
  readonly privileged: boolean;
}

export type PluginCredentialHandleDto =
  | { readonly name: string; readonly kind: 'exact' }
  | {
      readonly name: string;
      readonly kind: 'ai';
      readonly models: readonly ('fast' | 'reasoning' | 'embedding')[];
    };
