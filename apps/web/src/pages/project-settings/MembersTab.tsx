import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { MembersTable } from '../../features/project-settings/members/components/MembersTable/MembersTable';
import { MemberDetailsSheet } from '../../features/project-settings/members/components/MemberDetailsSheet/MemberDetailsSheet';
import { useMembersSettings } from '../../features/project-settings/members/model/members-settings.context';
import { ConfirmationDialog } from '../../shared/components/ConfirmationDialog';
import { contextService } from '../../features/contexts/services/context.service';
import type { MemberWithScopeDto } from '../../features/contexts/types/context.types';

export function MembersTab() {
  const { members, contexts, refresh, optimisticRemoveMember, isAdmin, openInviteSheet } =
    useMembersSettings();
  const [selected, setSelected] = useState<MemberWithScopeDto | null>(null);
  const [pendingRemove, setPendingRemove] = useState<MemberWithScopeDto | null>(null);
  const [removing, setRemoving] = useState(false);

  const openMemberSheet = (userId: string) => {
    const member = members.find(m => m.userId === userId);
    if (member) setSelected(member);
  };

  const requestRemove = (userId: string) => {
    const member = members.find(m => m.userId === userId);
    if (member) setPendingRemove(member);
  };

  const confirmRemove = async () => {
    if (!pendingRemove || removing) return;
    setRemoving(true);
    try {
      await contextService.removeMember(pendingRemove.userId);
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
    <>
      <MembersTable
        members={members}
        contexts={contexts}
        isAdmin={isAdmin}
        onRowClick={member => {
          if (isAdmin) setSelected(member);
        }}
        onEditMember={openMemberSheet}
        onRemoveMember={requestRemove}
        onInvite={openInviteSheet}
      />

      <MemberDetailsSheet
        isOpen={!!selected}
        member={selected}
        contexts={contexts}
        onClose={() => {
          setSelected(null);
        }}
        onSaved={() => {
          setSelected(null);
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
    </>
  );
}
