import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { ContextsTable } from '../../features/contexts/components/ContextsTable/ContextsTable';
import { ContextDetailsSheet } from '../../features/contexts/components/ContextDetailsSheet/ContextDetailsSheet';
import { useMembersSettings } from '../../features/project-settings/members/model/members-settings.context';
import { contextService } from '../../features/contexts/services/context.service';
import { useProjectRoute } from '../../shared/hooks';
import { ConfirmationDialog } from '../../shared/components/ConfirmationDialog';
import type { ContextDto, ContextImpactDto } from '../../features/contexts/types/context.types';

function buildContextsFilterUrl(basePath: string, contextId: string): string {
  const params = new URLSearchParams();
  params.set('filters', JSON.stringify([{ f: 'contexts', o: 'eq', v: [contextId] }]));
  return `${basePath}?${params.toString()}`;
}

export function ContextsTab() {
  const { contexts, members, refresh, isAdmin, openAddContextSheet } = useMembersSettings();
  const { scope } = useProjectRoute();
  const [selected, setSelected] = useState<ContextDto | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ContextDto | null>(null);
  const [blocked, setBlocked] = useState<{
    context: ContextDto;
    impact: ContextImpactDto;
  } | null>(null);

  const openContextSheet = (contextId: string) => {
    const ctx = contexts.find(c => c.id === contextId);
    if (ctx) setSelected(ctx);
  };

  const handleDelete = async (contextId: string) => {
    const ctx = contexts.find(c => c.id === contextId);
    if (!ctx) return;
    try {
      const impact = await contextService.getContextImpact(contextId);
      const total =
        impact.dataMartCount +
        impact.storageCount +
        impact.destinationCount +
        impact.memberCount +
        impact.userProvisioningDefaultsCount;
      if (total > 0) {
        setBlocked({ context: ctx, impact });
      } else {
        setPendingDelete(ctx);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load impact');
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await contextService.deleteContext(pendingDelete.id);
      toast.success('Context deleted');
      setPendingDelete(null);
      void refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete');
    }
  };

  const renderAttachments = (contextId: string, impact: ContextImpactDto) => {
    interface Part {
      label: string;
      to: string;
    }
    const parts: Part[] = [];
    if (impact.dataMartCount > 0)
      parts.push({
        label: `${String(impact.dataMartCount)} Data Mart${impact.dataMartCount === 1 ? '' : 's'}`,
        to: buildContextsFilterUrl(scope('/data-marts'), contextId),
      });
    if (impact.storageCount > 0)
      parts.push({
        label: `${String(impact.storageCount)} Storage${impact.storageCount === 1 ? '' : 's'}`,
        to: buildContextsFilterUrl(scope('/data-storages'), contextId),
      });
    if (impact.destinationCount > 0)
      parts.push({
        label: `${String(impact.destinationCount)} Destination${impact.destinationCount === 1 ? '' : 's'}`,
        to: buildContextsFilterUrl(scope('/data-destinations'), contextId),
      });
    if (impact.memberCount > 0)
      parts.push({
        label: `${String(impact.memberCount)} Member${impact.memberCount === 1 ? '' : 's'}`,
        to: scope('/project-settings/members'),
      });
    if (impact.userProvisioningDefaultsCount > 0)
      parts.push({
        label: `${String(impact.userProvisioningDefaultsCount)} User Provisioning Default${impact.userProvisioningDefaultsCount === 1 ? '' : 's'}`,
        to: scope('/project-settings/members'),
      });
    return parts.map((part, index) => (
      <span key={`${part.to}-${part.label}`}>
        {index > 0 && ', '}
        <Link
          to={part.to}
          className='text-primary hover:underline'
          onClick={() => {
            setBlocked(null);
          }}
        >
          {part.label}
        </Link>
      </span>
    ));
  };

  return (
    <>
      <ContextsTable
        contexts={contexts}
        members={members}
        isAdmin={isAdmin}
        onRowClick={ctx => {
          if (isAdmin) setSelected(ctx);
        }}
        onEditContext={openContextSheet}
        onDeleteContext={id => {
          void handleDelete(id);
        }}
        onAddContext={openAddContextSheet}
      />

      <ContextDetailsSheet
        isOpen={!!selected}
        context={selected}
        members={members}
        onClose={() => {
          setSelected(null);
        }}
        onSaved={() => {
          setSelected(null);
          void refresh();
        }}
      />

      <ConfirmationDialog
        open={!!pendingDelete}
        onOpenChange={open => {
          if (!open) setPendingDelete(null);
        }}
        title='Delete context'
        description={
          <span>
            Are you sure you want to delete{' '}
            <strong>&ldquo;{pendingDelete?.name ?? ''}&rdquo;</strong>? This action cannot be
            undone.
          </span>
        }
        confirmLabel='Delete'
        cancelLabel='Cancel'
        variant='destructive'
        onConfirm={() => {
          void confirmDelete();
        }}
      />

      <ConfirmationDialog
        open={!!blocked}
        onOpenChange={open => {
          if (!open) setBlocked(null);
        }}
        title='Cannot delete context'
        description={
          blocked ? (
            <span className='block space-y-2'>
              <span className='block'>
                <strong>&ldquo;{blocked.context.name}&rdquo;</strong> is attached to{' '}
                {renderAttachments(blocked.context.id, blocked.impact)}.
              </span>
              <span className='text-muted-foreground block'>
                Detach it from all Data Marts, Storages, Destinations, Members and User Provisioning
                defaults before deleting.
              </span>
            </span>
          ) : null
        }
        confirmLabel='Got it'
        variant='default'
        onConfirm={() => {
          setBlocked(null);
        }}
      />
    </>
  );
}
