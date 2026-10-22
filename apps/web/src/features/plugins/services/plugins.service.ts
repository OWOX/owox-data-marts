import type { AxiosRequestConfig } from '../../../app/api';
import { ApiService } from '../../../services';
import type {
  InstalledPlugin,
  PluginEntryPoint,
  PluginGalleryEntry,
  PluginHistoryPage,
  PluginHistoryType,
  PluginInstallation,
  PluginPublication,
  PluginPublicationScope,
  PluginRun,
  PluginRunFilters,
  PluginRunPage,
  PluginRuntimeToken,
  PluginUpdateResult,
  ProjectPluginSchedule,
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

  /** One page of the member's plugin history in this project, newest first. */
  async getHistory(type: PluginHistoryType, cursor?: string): Promise<PluginHistoryPage> {
    return this.get<PluginHistoryPage>('/history', cursor ? { type, cursor } : { type });
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
  async install(
    pluginId: string,
    expectedVersionId: string | null,
    credentialSelections: Readonly<Record<string, string | null>> = {}
  ): Promise<PluginInstallation> {
    const payload: {
      expectedVersionId: string | null;
      credentialSelections?: Readonly<Record<string, string | null>>;
    } = {
      expectedVersionId,
    };
    if (Object.keys(credentialSelections).length > 0) {
      payload.credentialSelections = credentialSelections;
    }
    return this.post<PluginInstallation>(`/${pluginId}/installation`, payload);
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

  /** The schedules the caller can see, or one installation's; the pages after the first are read together. */
  async listSchedules(installationId?: string): Promise<ProjectPluginSchedule[]> {
    const readPage = (offset: number) =>
      this.get<{ items: ProjectPluginSchedule[]; total: number }>(
        '/schedules',
        installationId === undefined ? { offset } : { offset, installationId },
        { skipErrorToast: true } as AxiosRequestConfig
      );
    const first = await readPage(0);
    const size = first.items.length;
    const offsets: number[] = [];
    // An empty first page ends the read even when deletes shrank the list under it.
    for (let offset = size; size > 0 && offset < first.total; offset += size) {
      offsets.push(offset);
    }
    const rest = await Promise.all(offsets.map(readPage));
    // A row that enters ahead of an offset between two page reads would come back twice.
    const byId = new Map<string, ProjectPluginSchedule>();
    for (const page of [first, ...rest]) {
      for (const item of page.items) {
        byId.set(item.id, item);
      }
    }
    return [...byId.values()];
  }

  // The card and the page report a refusal themselves, so the global toast would say it twice.
  async pauseSchedule(id: string): Promise<ProjectPluginSchedule> {
    return this.post<ProjectPluginSchedule>(`/schedules/${id}/pause`, undefined, {
      skipErrorToast: true,
    } as AxiosRequestConfig);
  }

  async resumeSchedule(id: string): Promise<ProjectPluginSchedule> {
    return this.post<ProjectPluginSchedule>(`/schedules/${id}/resume`, undefined, {
      skipErrorToast: true,
    } as AxiosRequestConfig);
  }

  async deleteSchedule(id: string): Promise<void> {
    return this.delete(`/schedules/${id}`, { skipErrorToast: true } as AxiosRequestConfig);
  }

  /** One page of runs, newest first. Statuses go as repeated keys: the API refuses `status[]`. */
  async listRuns(filters: PluginRunFilters, cursor?: string): Promise<PluginRunPage> {
    return this.get<PluginRunPage>(
      '/runs',
      {
        status: filters.statuses,
        trigger: filters.trigger,
        pluginId: filters.pluginId,
        scheduleId: filters.scheduleId,
        userId: filters.userId,
        cursor,
      },
      { skipErrorToast: true, paramsSerializer: { indexes: null } } as AxiosRequestConfig
    );
  }

  // A linked run that is gone answers 404, which the page drops without a toast.
  async getRun(id: string): Promise<PluginRun> {
    return this.get<PluginRun>(`/runs/${id}`, undefined, {
      skipErrorToast: true,
    } as AxiosRequestConfig);
  }

  async cancelRun(id: string): Promise<PluginRun> {
    return this.post<PluginRun>(`/runs/${id}/cancel`, undefined, {
      skipErrorToast: true,
    } as AxiosRequestConfig);
  }

  async lookupByRepository(repository: string): Promise<{ pluginId: string }> {
    return this.get<{ pluginId: string }>('/lookup', { repository }, {
      skipErrorToast: true,
    } as AxiosRequestConfig);
  }
}

export const pluginsService = new PluginsService();
