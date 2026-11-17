import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { MembersTable } from '../../features/project-settings/members/components/MembersTable/MembersTable';
import { MemberDetailsSheet } from '../../features/project-settings/members/components/MemberDetailsSheet/MemberDetailsSheet';
import { PendingRequestsSection } from '../../features/project-settings/members/components/PendingRequestsSection/PendingRequestsSection';
import { UserProvisioningSettings } from '../../features/project-settings/members/components/UserProvisioningSettings/UserProvisioningSettings';
import { useMembersSettings } from '../../features/project-settings/members/model/members-settings.context';
import { useRecordSheet } from '../../shared/hooks';
import { ConfirmationDialog } from '../../shared/components/ConfirmationDialog';
import { projectMembersService } from '../../features/project-members/services/project-members.service';
import type { MemberWithScopeDto } from '../../features/contexts/types/context.types';

export function MembersTab() {
  const {
    members,
    contexts,
    refresh,
    optimisticRemoveMember,
    isAdmin,
    openInviteSheet,
    hasLoadError,
    hasLoaded,
  } = useMembersSettings();
  const [pendingRemove, setPendingRemove] = useState<MemberWithScopeDto | null>(null);
  const [removing, setRemoving] = useState(false);

  // `hasLoaded`, not `loading`: a refresh must not close the open sheet.
  const {
    record: selected,
    open: openMemberSheet,
    close: closeMemberSheet,
    link: memberLink,
  } = useRecordSheet({
    param: 'member',
    records: isAdmin && hasLoaded && !hasLoadError ? members : undefined,
    getId: m => m.userId,
    notFoundMessage: () => 'This member is not in the project.',
  });

  const requestRemove = (userId: string) => {
    const member = members.find(m => m.userId === userId);
    if (member) setPendingRemove(member);
  };

  const confirmRemove = async () => {
    if (!pendingRemove || removing) return;
    setRemoving(true);
    try {
      await projectMembersService.removeMember(pendingRemove.userId);
      // Legacy platform is eventually consistent — the next getMembers may
      // still echo the removed user. Drop them locally first so the row
      // disappears immediately; refresh() reconciles once upstream catches up.
      optimisticRemoveMember(pendingRemove.userId);
      toast.success(`${pendingRemove.email} removed from project`);
      setPendingRemove(null);
      void refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove member');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className='flex flex-col gap-4'>
      <PendingRequestsSection />

      {!hasLoadError && <UserProvisioningSettings contexts={contexts} isAdmin={isAdmin} />}

      <MembersTable
        members={members}
        contexts={contexts}
        isAdmin={isAdmin}
        onRowClick={member => {
          if (isAdmin) openMemberSheet(member.userId);
        }}
        onEditMember={openMemberSheet}
        onRemoveMember={requestRemove}
        onInvite={openInviteSheet}
      />

      <MemberDetailsSheet
        isOpen={!!selected}
        member={selected}
        contexts={contexts}
        link={memberLink}
        onClose={closeMemberSheet}
        onSaved={() => {
          closeMemberSheet();
          void refresh();
        }}
      />

      <ConfirmationDialog
        open={!!pendingRemove}
        onOpenChange={open => {
          if (!open) setPendingRemove(null);
        }}
        title='Remove member from project'
        description={
          <span className='mt-2 block'>
            Are you sure you want to remove{' '}
            <strong>{pendingRemove?.displayName ?? pendingRemove?.email}</strong> from the project?
            They will lose access to all resources. This action cannot be undone.
          </span>
        }
        confirmLabel='Remove'
        cancelLabel='Cancel'
        variant='destructive'
        onConfirm={() => {
          void confirmRemove();
        }}
      />
    </div>
  );
}
