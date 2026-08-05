import { ApiService } from '../../../services';
import type {
  InstalledPlugin,
  PluginEntryPoint,
  PluginGalleryEntry,
  PluginInstallation,
  PluginPublication,
  PluginPublicationScope,
  PluginRuntimeToken,
  PluginUpdateResult,
  PublishPluginRequest,
} from '../types';

class PluginsService extends ApiService {
  constructor() {
    super('/plugins');
  }

  /** Deployment, project and member publications, already combined and deduplicated. */
  async getGallery(): Promise<PluginGalleryEntry[]> {
    return this.get<PluginGalleryEntry[]>('/gallery');
  }

  /** Works for a plugin no publication makes visible -- a direct link is its own path. */
  async getPlugin(pluginId: string): Promise<PluginGalleryEntry> {
    return this.get<PluginGalleryEntry>(`/${pluginId}`);
  }

  async getInstallations(includeUninstalled = false): Promise<InstalledPlugin[]> {
    return this.get<InstalledPlugin[]>(
      '/installations',
      includeUninstalled ? { includeUninstalled: 'true' } : undefined
    );
  }

  /**
   * Mints a short-lived token bound to one installation.
   *
   * Owned by the delegated runtime authorization track. It never reaches plugin code:
   * the host bridge holds it in a closure and attaches it to forwarded requests.
   */
  async getRuntimeToken(installationId: string): Promise<PluginRuntimeToken> {
    return this.post<PluginRuntimeToken>(`/installations/${installationId}/runtime-token`);
  }

  /** The only response carrying a delivery URL, and only for the caller's live installation. */
  async getEntryPoint(installationId: string): Promise<PluginEntryPoint> {
    return this.get<PluginEntryPoint>(`/installations/${installationId}/entry`);
  }

  /**
   * expectedVersionId is the version the member was shown. The server refuses a stale
   * one rather than installing something they never read about.
   */
  async install(pluginId: string, expectedVersionId: string | null): Promise<PluginInstallation> {
    return this.post<PluginInstallation>(`/${pluginId}/installation`, { expectedVersionId });
  }

  async uninstall(pluginId: string): Promise<void> {
    return this.delete(`/${pluginId}/installation`);
  }

  /**
   * Asks the deployment to run its managed check now.
   *
   * It does not choose whether to update: the deployment checks daily anyway, and
   * whatever valid higher version it finds becomes current for every active installation.
   */
  async checkNow(pluginId: string): Promise<PluginUpdateResult> {
    return this.post<PluginUpdateResult>(`/${pluginId}/update`);
  }

  /** Only the publications the caller may manage at that level. */
  async listPublications(scope: PluginPublicationScope): Promise<PluginPublication[]> {
    return this.get<PluginPublication[]>('/publications', { scope });
  }

  async publish(payload: PublishPluginRequest): Promise<PluginPublication> {
    return this.post<PluginPublication>('/publications', payload);
  }

  async unpublish(payload: PublishPluginRequest): Promise<PluginPublication> {
    return this.post<PluginPublication>('/publications/unpublish', payload);
  }
}

export const pluginsService = new PluginsService();
