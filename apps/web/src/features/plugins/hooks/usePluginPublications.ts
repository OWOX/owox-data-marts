import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { useIsAdmin } from '../../idp/hooks/useRole';
import { useProjectId } from '../../../shared/hooks';
import { pluginsService } from '../services/plugins.service';
import type { PluginPublication, PluginPublicationScope } from '../types';
import { GALLERY_KEY, PUBLICATIONS_KEY } from './usePlugins';

const EMPTY: PluginPublication[] = [];

/**
 * The scopes this member may publish at, from the browser.
 *
 * Deployment scope is intentionally absent: it is gated on an API key allowlist and has
 * no browser equivalent, so offering it here would only produce a refusal. Member scope
 * is open to everyone, which is what makes plugins usable without waiting on an admin.
 */
export function usePublishableScopes(): PluginPublicationScope[] {
  const isAdmin = useIsAdmin();
  return isAdmin ? ['project', 'member'] : ['member'];
}

/**
 * @param enabled gates the request, because listing a scope the caller cannot manage is
 *   refused by the server rather than returned empty.
 */
export function usePluginPublications(scope: PluginPublicationScope, enabled = true) {
  const projectId = useProjectId();

  const { data, isLoading, refetch } = useQuery({
    queryKey: [PUBLICATIONS_KEY, projectId, scope],
    queryFn: () => pluginsService.listPublications(scope),
    enabled: Boolean(projectId) && enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });

  return { publications: data ?? EMPTY, isLoading, refetch };
}

/**
 * The active publications of one plugin that this caller may withdraw.
 *
 * Not derived from the Gallery entry's visibleViaScopes: that says why a plugin is
 * visible, which is not the same as who may unpublish it. An ordinary member sees a
 * project publication and may not touch it.
 */
export function usePluginManageablePublications(pluginId: string): PluginPublication[] {
  const scopes = usePublishableScopes();

  const project = usePluginPublications('project', scopes.includes('project'));
  const member = usePluginPublications('member');

  return useMemo(
    () =>
      [...project.publications, ...member.publications].filter(
        publication => publication.isActive && publication.pluginId === pluginId
      ),
    [project.publications, member.publications, pluginId]
  );
}

export interface PublishFailure {
  message: string;
  /** Present when OWOX cannot read the repository and the publisher can grant access. */
  installationUrl?: string;
}

export function usePluginPublishing() {
  const queryClient = useQueryClient();
  const projectId = useProjectId();

  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [PUBLICATIONS_KEY, projectId] }),
      // Publishing changes what the Gallery shows, so refreshing one without the other
      // leaves the member looking at a list that no longer matches.
      queryClient.invalidateQueries({ queryKey: [GALLERY_KEY, projectId] }),
    ]);
  }, [queryClient, projectId]);

  const publishMutation = useMutation({
    mutationFn: (payload: { repository: string; scope: PluginPublicationScope }) =>
      pluginsService.publish(payload),
    onSuccess: invalidate,
  });

  const unpublishMutation = useMutation({
    mutationFn: (payload: { repository: string; scope: PluginPublicationScope }) =>
      pluginsService.unpublish(payload),
    onSuccess: invalidate,
  });

  /**
   * Returns the failure instead of throwing, because one of them is actionable.
   *
   * A repository OWOX cannot read is fixed by installing the GitHub App, and the server
   * hands back exactly where. A toast would bury the one link that resolves it.
   */
  const publish = useCallback(
    async (repository: string, scope: PluginPublicationScope): Promise<PublishFailure | null> => {
      try {
        await publishMutation.mutateAsync({ repository, scope });
        toast.success('Plugin published');
        return null;
      } catch (caught) {
        return readPublishFailure(caught);
      }
    },
    [publishMutation]
  );

  const unpublish = useCallback(
    async (repository: string, scope: PluginPublicationScope) => {
      try {
        await unpublishMutation.mutateAsync({ repository, scope });
        toast.success('Plugin unpublished');
      } catch (caught) {
        toast.error(readPublishFailure(caught).message);
        throw caught;
      }
    },
    [unpublishMutation]
  );

  return {
    publish,
    unpublish,
    isPublishing: publishMutation.isPending,
    isUnpublishing: unpublishMutation.isPending,
  };
}

function readPublishFailure(caught: unknown): PublishFailure {
  const body = (caught as { response?: { data?: Record<string, unknown> } } | null)?.response?.data;
  const details = body?.errorDetails as { installationUrl?: string } | undefined;

  return {
    message: (body?.message as string | undefined) ?? 'Could not publish this plugin.',
    ...(body?.code === 'GITHUB_REPO_NOT_ACCESSIBLE' && details?.installationUrl
      ? { installationUrl: details.installationUrl }
      : {}),
  };
}
