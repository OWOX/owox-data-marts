import { useState, useEffect, useCallback, useMemo } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@owox/ui/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { AlertCircle } from 'lucide-react';
import { useIsAdmin } from '../../features/idp/hooks/useRole';
import { useFlags } from '../../app/store/hooks';
import { checkVisible } from '../../utils/check-visible';
import { contextService } from '../../features/contexts/services/context.service';
import { projectMembersService } from '../../features/project-members/services/project-members.service';
import type { ContextDto, MemberWithScopeDto } from '../../features/contexts/types/context.types';
import type { MembershipRequestDto } from '../../features/project-members/types';
import { InviteMemberSheet } from '../../features/project-settings/members/components/InviteMemberSheet/InviteMemberSheet';
import { AddContextSheet } from '../../features/contexts/components/AddContextSheet/AddContextSheet';
import { MembersSettingsProvider } from '../../features/project-settings/members/model/MembersSettingsProvider';
import { MembershipRequestSheet } from '../../features/project-settings/members/components/MembershipRequestSheet/MembershipRequestSheet';
import { useTombstonedCollection } from '../../features/project-settings/members/model/useTombstonedCollection';

interface TabLink {
  name: string;
  path: string;
  end: boolean;
}

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
  const { flags } = useFlags();
  const isOwoxIdpProvider = checkVisible('IDP_PROVIDER', ['owox-better-auth'], flags);
  const [contexts, setContexts] = useState<ContextDto[]>([]);
  const [members, setMembers] = useState<MemberWithScopeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addContextOpen, setAddContextOpen] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<MembershipRequestDto[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestSheetTarget, setRequestSheetTarget] = useState<MembershipRequestDto | null>(null);

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
          return [] as MembershipRequestDto[];
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
      setPendingRequests(requestTombstones.reconcile(reqs));
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

  const openMembershipRequestSheet = useCallback((request: MembershipRequestDto) => {
    setRequestSheetTarget(request);
  }, []);

  const navigation: TabLink[] = [
    { name: 'Overview', path: '.', end: true },
    { name: 'Members', path: 'members', end: false },
    { name: 'Contexts', path: 'contexts', end: false },
    ...(isOwoxIdpProvider
      ? [
          { name: 'Credit consumption', path: 'credit', end: false },
          { name: 'Subscription', path: 'subscription', end: false },
        ]
      : []),
    { name: 'Notifications', path: 'notifications', end: false },
  ];

  // Stabilize the context value object so consumers do not re-render every
  // time `ProjectSettingsPage` itself rerenders for unrelated reasons (sheet
  // open/close state, etc.).
  const providerValue = useMemo(
    () => ({
      contexts,
      members,
      pendingRequests,
      loading,
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
              end={item.end}
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
        />

        <MembershipRequestSheet
          isOpen={requestSheetTarget !== null}
          request={requestSheetTarget}
          contexts={contexts}
          onClose={() => {
            setRequestSheetTarget(null);
          }}
          onResolved={resolved => {
            setRequestSheetTarget(null);
            if (resolved) void loadData();
          }}
        />
      </div>
    </MembersSettingsProvider>
  );
}
