import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { extractApiError } from '../../../app/api/extract-api-error.util';
import { useProjectId } from '../../../shared/hooks';
import { actionableRejections } from '../rejections';
import { pluginsService } from '../services/plugins.service';
import type { InstalledPlugin, PluginGalleryEntry, PluginUpdateResult } from '../types';

/**
 * Exported because publishing invalidates the Gallery too, from the other hook module.
 * Two copies of this string would drift silently: the queries would simply stop being
 * invalidated, and the member would read a stale list with nothing failing anywhere.
 */
export const GALLERY_KEY = 'plugin-gallery';
/** Shared with usePluginPublications for the same no-silent-drift reason as GALLERY_KEY. */
export const PUBLICATIONS_KEY = 'plugin-publications';
const INSTALLATIONS_KEY = 'plugin-installations';

const EMPTY_GALLERY: PluginGalleryEntry[] = [];
const EMPTY_INSTALLATIONS: InstalledPlugin[] = [];

/** Every key carries the project: switching projects must not show the previous one's plugins. */
const galleryKey = (projectId: string | null) => [GALLERY_KEY, projectId];
const installationsKey = (projectId: string | null, includeUninstalled: boolean) => [
  INSTALLATIONS_KEY,
  projectId,
  includeUninstalled,
];

export function usePluginGallery() {
  const projectId = useProjectId();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: galleryKey(projectId),
    queryFn: () => pluginsService.getGallery(),
    enabled: Boolean(projectId),
    retry: false,
    refetchOnWindowFocus: false,
  });

  return {
    plugins: data ?? EMPTY_GALLERY,
    isLoading,
    isError,
    error,
    refetch,
  };
}

export function usePlugin(pluginId: string | undefined) {
  const projectId = useProjectId();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [GALLERY_KEY, projectId, pluginId],
    queryFn: () => pluginsService.getPlugin(pluginId ?? ''),
    enabled: Boolean(projectId && pluginId),
    retry: false,
    refetchOnWindowFocus: false,
  });

  return { plugin: data, isLoading, isError, error };
}

export function usePluginInstallations(includeUninstalled = false) {
  const projectId = useProjectId();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: installationsKey(projectId, includeUninstalled),
    queryFn: () => pluginsService.getInstallations(includeUninstalled),
    enabled: Boolean(projectId),
    retry: false,
    refetchOnWindowFocus: false,
  });

  return { installations: data ?? EMPTY_INSTALLATIONS, isLoading, isError, refetch };
}

interface StaleVersionSignal {
  currentVersionId: string | null;
  currentSemver: string | null;
}

/**
 * Install, uninstall and update, with the cache invalidation each one implies.
 *
 * A plugin's state shows up in both the Gallery and the installation list, so every
 * mutation refreshes both -- leaving one stale is how a member ends up looking at a
 * button that no longer matches reality.
 */
export function usePluginActions() {
  const queryClient = useQueryClient();
  const projectId = useProjectId();

  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [GALLERY_KEY, projectId] }),
      queryClient.invalidateQueries({ queryKey: [INSTALLATIONS_KEY, projectId] }),
    ]);
  }, [queryClient, projectId]);

  const installMutation = useMutation({
    mutationFn: ({
      pluginId,
      expectedVersionId,
      credentialSelections,
    }: {
      pluginId: string;
      expectedVersionId: string | null;
      credentialSelections: Readonly<Record<string, string | null>>;
    }) => pluginsService.install(pluginId, expectedVersionId, credentialSelections),
    onSuccess: invalidate,
  });

  const uninstallMutation = useMutation({
    mutationFn: (pluginId: string) => pluginsService.uninstall(pluginId),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: (pluginId: string) => pluginsService.checkNow(pluginId),
    // A check rewrites the sync report that the publisher's Release issues card reads
    // from, so publications refresh along with the member-facing lists.
    onSuccess: () =>
      Promise.all([
        invalidate(),
        queryClient.invalidateQueries({ queryKey: [PUBLICATIONS_KEY, projectId] }),
      ]),
  });

  /**
   * Returns the newer version instead of throwing when the confirmation went stale.
   *
   * Any installed member can move a plugin forward at any moment, so this is an ordinary
   * race rather than an error: the caller re-renders the confirmation with what is
   * current now. A raw toast here would tell the member nothing they can act on.
   */
  const install = useCallback(
    async (
      pluginId: string,
      expectedVersionId: string | null,
      credentialSelections: Readonly<Record<string, string | null>> = {}
    ): Promise<PluginGalleryEntry | null> => {
      try {
        await installMutation.mutateAsync({ pluginId, expectedVersionId, credentialSelections });
        return null;
      } catch (caught) {
        const stale = readStaleVersion(caught);
        if (stale) {
          await invalidate();
          return pluginsService.getPlugin(pluginId);
        }

        toast.error(errorMessage(caught));
        throw caught;
      }
    },
    [installMutation, invalidate]
  );

  const uninstall = useCallback(
    async (pluginId: string) => {
      try {
        await uninstallMutation.mutateAsync(pluginId);
      } catch (caught) {
        toast.error(errorMessage(caught));
        throw caught;
      }
    },
    [uninstallMutation]
  );

  /**
   * Asks for the deployment's next check now, and says which of the four outcomes
   * happened.
   *
   * A check that could not reach GitHub is an outcome, not a failed request: the member
   * is told the current version stays active rather than shown a raw error.
   */
  const checkNow = useCallback(
    async (pluginId: string) => {
      try {
        const result = await updateMutation.mutateAsync(pluginId);
        reportOutcome(result);
        return result;
      } catch (caught) {
        toast.error(errorMessage(caught));
        throw caught;
      }
    },
    [updateMutation]
  );

  return {
    install,
    uninstall,
    checkNow,
    isInstalling: installMutation.isPending,
    isUninstalling: uninstallMutation.isPending,
    isUpdating: updateMutation.isPending,
  };
}

/**
 * Plain language for each outcome, in the member's terms rather than the API's.
 *
 * Success says who else is affected, because a member who pressed Check now has no other
 * way to learn that the version they just activated is now everyone's. Failure names no
 * source: which host could not be reached is a publisher diagnostic, and the member can
 * act on none of it.
 *
 * For a publisher whose fresh check rejected a release, "you're up to date" would be
 * the "Check now did nothing" silence all over again -- the response carries their
 * diagnostics precisely so this toast can say what actually happened.
 *
 * Falls back to `updated` when the response predates the outcome field, so the older
 * half of a rolling deploy still says something true.
 */
function reportOutcome(result: PluginUpdateResult): void {
  const outcome = result.outcome ?? (result.updated ? 'updated' : 'up_to_date');
  const version = result.currentSemver ? `v${result.currentSemver}` : 'the current version';

  if (outcome === 'updated') {
    const activated = result.currentSemver ? `v${result.currentSemver}` : 'a newer version';
    toast.success(`Updated to ${activated}. Everyone using this plugin now has this version.`);
    return;
  }

  if (outcome === 'failed') {
    toast.error(
      `Couldn't check for updates. ${version} remains active and OWOX will try again automatically.`
    );
    return;
  }

  if (outcome === 'up_to_date') {
    const rejected = actionableRejections(result.diagnostics?.rejections ?? []);
    if (rejected.length > 0) {
      // The report is newest-first, so the first entry is the release that just failed
      // to become current. The card below the fold carries the full detail.
      toast.error(
        `${rejected[0].tagName} was rejected (${rejected[0].code}). ${version} stays active — see Release issues for details.`
      );
      return;
    }
  }

  toast(
    outcome === 'already_running'
      ? 'An update check is already running'
      : `You're up to date — ${version}`
  );
}

/** Falls back to a generic line: an axios failure with no body still needs to say something. */
function errorMessage(caught: unknown): string {
  const apiError = extractApiError(caught) as { message?: string } | undefined;
  return apiError?.message ?? 'Something went wrong. Please try again.';
}

function readStaleVersion(caught: unknown): StaleVersionSignal | null {
  const body = (caught as { response?: { data?: Record<string, unknown> } }).response?.data;
  if (body?.code !== 'PLUGIN_STALE_VERSION') {
    return null;
  }

  const details = body.errorDetails as StaleVersionSignal | undefined;
  return {
    currentVersionId: details?.currentVersionId ?? null,
    currentSemver: details?.currentSemver ?? null,
  };
}
