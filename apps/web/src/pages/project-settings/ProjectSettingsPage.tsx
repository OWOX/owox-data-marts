import { useState, useEffect, useCallback } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@owox/ui/lib/utils';
import { useIsAdmin } from '../../features/idp/hooks/useRole';
import { useFlags } from '../../app/store/hooks';
import { checkVisible } from '../../utils/check-visible';
import { contextService } from '../../features/contexts/services/context.service';
import type { ContextDto, MemberWithScopeDto } from '../../features/contexts/types/context.types';
import { InviteMemberSheet } from '../../features/project-settings/members/components/InviteMemberSheet/InviteMemberSheet';
import { AddContextSheet } from '../../features/contexts/components/AddContextSheet/AddContextSheet';
import { MembersSettingsProvider } from '../../features/project-settings/members/model/MembersSettingsProvider';

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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addContextOpen, setAddContextOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ctxs, mems] = await Promise.all([
        contextService.getContexts(),
        contextService.getMembers(),
      ]);
      setContexts(ctxs);
      setMembers(mems);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openInviteSheet = useCallback(() => {
    setInviteOpen(true);
  }, []);
  const openAddContextSheet = useCallback(() => {
    setAddContextOpen(true);
  }, []);
  const optimisticRemoveMember = useCallback((userId: string) => {
    setMembers(prev => prev.filter(m => m.userId !== userId));
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
    { name: 'Notification', path: 'notifications', end: false },
  ];

  return (
    <MembersSettingsProvider
      value={{
        contexts,
        members,
        loading,
        refresh: loadData,
        optimisticRemoveMember,
        isAdmin,
        openInviteSheet,
        openAddContextSheet,
      }}
    >
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
      </div>
    </MembersSettingsProvider>
  );
}
