import { useState, useEffect, useCallback, useMemo } from 'react';
import { NavLink, Outlet } from 'react-router';
import { cn } from '@owox/ui/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { AlertCircle } from 'lucide-react';
import { useIsAdmin } from '../../features/idp/hooks/useRole';
import { useProjectId, useRecordSheet } from '../../shared/hooks';
import { McpPromoCard, buildMcpPrompt, useIsMcpPromoAvailable } from '../../features/mcp-promo';
import { useFlags } from '../../app/store/hooks';
import { getProjectSettingsTabs } from '../../features/project-settings/project-settings-tabs';
import { contextService } from '../../features/contexts/services/context.service';
import { projectMembersService } from '../../features/project-members/services/project-members.service';
import type { ContextDto, MemberWithScopeDto } from '../../features/contexts/types/context.types';
import type { MembershipRequestDto } from '../../features/project-members/types';
import { InviteMemberSheet } from '../../features/project-settings/members/components/InviteMemberSheet/InviteMemberSheet';
import { AddContextSheet } from '../../features/contexts/components/AddContextSheet/AddContextSheet';
import { MembersSettingsProvider } from '../../features/project-settings/members/model/MembersSettingsProvider';
import { MembershipRequestSheet } from '../../features/project-settings/members/components/MembershipRequestSheet/MembershipRequestSheet';
import { useTombstonedCollection } from '../../features/project-settings/members/model/useTombstonedCollection';
import { useRefreshSetupProgress } from '../../components/AppSidebar/SetupChecklist/useSetupProgress';

/**
 * Project Settings shell: one page with tabs for Overview, Members, Contexts,
 * Credit Consumption, Subscription, Notification Settings. Replaces the old
 * /members page, which now redirects here.
 *
 * Members + contexts data is loaded here (not inside child tabs) because the
 * Invite member / Add context CTAs live in child-table toolbars and fire back
 * through the `MembersSettingsProvider` openers — keeping the sheet state at
 * this level means opening a sheet from one tab does not unmount state in
 * another. Tabs that do not need this data simply ignore the provider.
 */
export function ProjectSettingsPage() {
  const isAdmin = useIsAdmin();
  const projectId = useProjectId();
  const isMcpAvailable = useIsMcpPromoAvailable();
  const { flags } = useFlags();
  const [contexts, setContexts] = useState<ContextDto[]>([]);
  const [members, setMembers] = useState<MemberWithScopeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const refreshSetupProgress = useRefreshSetupProgress();
  const [addContextOpen, setAddContextOpen] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<MembershipRequestDto[]>([]);
  const [requestsLoaded, setRequestsLoaded] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const {
    record: requestSheetTarget,
    open: openRequestSheet,
    close: closeRequestSheet,
    link: requestLink,
  } = useRecordSheet({
    param: 'request',
    records: isAdmin && requestsLoaded && error === null ? pendingRequests : undefined,
    getId: r => r.requestId,
    notFoundMessage: () => 'This membership request was already handled or is not available.',
  });

  const memberIdOf = useCallback((m: MemberWithScopeDto) => m.userId, []);
  const requestIdOf = useCallback((r: MembershipRequestDto) => r.requestId, []);
  const memberTombstones = useTombstonedCollection<MemberWithScopeDto>(memberIdOf);
  const requestTombstones = useTombstonedCollection<MembershipRequestDto>(requestIdOf);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadingRequests(isAdmin);
    setError(null);

    const requestsPromise = isAdmin
      ? projectMembersService.getMembershipRequests().catch((err: unknown) => {
          console.warn('Failed to load membership requests', err);
          return null;
        })
      : Promise.resolve<MembershipRequestDto[]>([]);
    try {
      const [ctxs, mems, reqs] = await Promise.all([
        contextService.getContexts(),
        projectMembersService.getMembers(),
        requestsPromise,
      ]);
      setContexts(ctxs);
      setMembers(memberTombstones.reconcile(mems));
      // A failed requests fetch keeps the last list: an empty one would drop a valid link.
      if (reqs) {
        setPendingRequests(requestTombstones.reconcile(reqs));
        setRequestsLoaded(true);
      }
      setHasLoaded(true);
    } catch (err) {
      // Without a catch the page renders empty arrays + loading=false, which
      // is indistinguishable from "this project really has no members /
      // contexts". Surface the error so the admin knows to retry.
      setError(err instanceof Error ? err.message : 'Failed to load project data');
    } finally {
      setLoading(false);
      setLoadingRequests(false);
    }
  }, [isAdmin, memberTombstones, requestTombstones]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openInviteSheet = useCallback(() => {
    setInviteOpen(true);
  }, []);
  const openAddContextSheet = useCallback(() => {
    setAddContextOpen(true);
  }, []);
  const optimisticRemoveMember = useCallback(
    (userId: string) => {
      memberTombstones.tombstone(userId);
      setMembers(prev => prev.filter(m => m.userId !== userId));
    },
    [memberTombstones]
  );

  const optimisticRemoveRequest = useCallback(
    (requestId: string) => {
      requestTombstones.tombstone(requestId);
      setPendingRequests(prev => prev.filter(r => r.requestId !== requestId));
    },
    [requestTombstones]
  );

  const openMembershipRequestSheet = useCallback(
    (request: MembershipRequestDto) => {
      openRequestSheet(request.requestId);
    },
    [openRequestSheet]
  );

  const navigation = getProjectSettingsTabs(flags);

  // Stabilize the context value object so consumers do not re-render every
  // time `ProjectSettingsPage` itself rerenders for unrelated reasons (sheet
  // open/close state, etc.).
  const providerValue = useMemo(
    () => ({
      contexts,
      members,
      pendingRequests,
      loading,
      hasLoaded,
      loadingRequests,
      hasLoadError: error !== null,
      refresh: loadData,
      optimisticRemoveMember,
      optimisticRemoveRequest,
      isAdmin,
      openInviteSheet,
      openAddContextSheet,
      openMembershipRequestSheet,
    }),
    [
      contexts,
      members,
      pendingRequests,
      loading,
      hasLoaded,
      loadingRequests,
      error,
      loadData,
      optimisticRemoveMember,
      optimisticRemoveRequest,
      isAdmin,
      openInviteSheet,
      openAddContextSheet,
      openMembershipRequestSheet,
    ]
  );

  return (
    <MembersSettingsProvider value={providerValue}>
      <div className='min-w-[600px] px-12 py-6'>
        <div className='mb-4 flex items-center gap-4'>
          <span className='text-2xl font-medium'>Project settings</span>
        </div>

        <nav
          className='no-scrollbar -mb-px flex gap-2 overflow-x-auto border-b whitespace-nowrap'
          aria-label='Tabs'
          role='tablist'
        >
          {navigation.map(item => (
            <NavLink
              key={item.name}
              to={item.path}
              end={item.path === '.'}
              className={({ isActive }) =>
                cn(
                  'border-b-2 px-4 py-4 text-sm font-medium whitespace-nowrap',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-200 dark:hover:text-gray-200'
                )
              }
            >
              {item.name}
            </NavLink>
          ))}
        </nav>

        {error !== null && (
          <Alert variant='destructive' className='mt-4'>
            <AlertCircle className='h-4 w-4' />
            <AlertTitle>Could not load project data</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className='pt-4'>
          <Outlet />
        </div>

        <InviteMemberSheet
          isOpen={inviteOpen}
          onClose={() => {
            setInviteOpen(false);
          }}
          contexts={contexts}
          onInvited={() => {
            setInviteOpen(false);
            void loadData();
            refreshSetupProgress();
          }}
        />

        <AddContextSheet
          isOpen={addContextOpen}
          onClose={() => {
            setAddContextOpen(false);
          }}
          members={members}
          onCreated={() => {
            setAddContextOpen(false);
            void loadData();
          }}
          promo={
            isMcpAvailable && projectId ? (
              <McpPromoCard
                variant='section'
                placement='context_sheet'
                mcpPart='setup'
                title='Set it up with your AI assistant'
                prompt={buildMcpPrompt('context_sheet', { projectId })}
              />
            ) : undefined
          }
        />

        <MembershipRequestSheet
          isOpen={requestSheetTarget !== null}
          request={requestSheetTarget}
          link={requestLink}
          contexts={contexts}
          onClose={closeRequestSheet}
          onResolved={resolved => {
            closeRequestSheet();
            if (resolved) void loadData();
          }}
        />
      </div>
    </MembersSettingsProvider>
  );
}
