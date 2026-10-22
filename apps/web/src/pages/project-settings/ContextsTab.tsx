import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useBlocker, useLocation, useNavigate, useSearchParams } from 'react-router';
import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { Button } from '@owox/ui/components/button';
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
  const { contexts, members, refresh, isAdmin, openAddContextSheet, loading, hasLoadError } =
    useMembersSettings();
  const { scope } = useProjectRoute();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const dirtyRef = useRef(false);
  const onDirtyChange = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirtyRef.current &&
      (currentLocation.pathname !== nextLocation.pathname ||
        new URLSearchParams(currentLocation.search).get('context') !==
          new URLSearchParams(nextLocation.search).get('context'))
  );
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);
  const selectedId = searchParams.get('context');
  const selected =
    !loading && !hasLoadError ? (contexts.find(c => c.id === selectedId) ?? null) : null;
  const [pendingDelete, setPendingDelete] = useState<ContextDto | null>(null);
  const [blocked, setBlocked] = useState<{
    context: ContextDto;
    impact: ContextImpactDto;
  } | null>(null);

  const openContextSheet = (contextId: string) => {
    setSearchParams(
      params => {
        params.set('context', contextId);
        return params;
      },
      {
        state: { ...(location.state as Record<string, unknown> | null), contextSheetId: contextId },
      }
    );
  };

  const closeContextSheet = () => {
    // A row click pushed this entry. Pop it instead of replacing it with a
    // duplicate list entry; direct links have no list entry to return to.
    if (
      (location.state as { contextSheetId?: string } | null)?.contextSheetId === selectedId &&
      selectedId
    ) {
      void navigate(-1);
      return;
    }
    setSearchParams(
      params => {
        params.delete('context');
        return params;
      },
      { replace: true }
    );
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
      {selectedId && !loading && !hasLoadError && !selected && (
        <Alert className='mb-4'>
          <AlertTitle>Context unavailable</AlertTitle>
          <AlertDescription>
            This context was deleted or is not available in this project.
            <Button type='button' variant='link' onClick={closeContextSheet}>
              Back to contexts
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <ContextsTable
        contexts={contexts}
        members={members}
        isAdmin={isAdmin}
        onRowClick={ctx => {
          openContextSheet(ctx.id);
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
        readOnly={!isAdmin}
        onDirtyChange={onDirtyChange}
        navigationGuard={{
          blocked: blocker.state === 'blocked',
          onConfirm: () => {
            dirtyRef.current = false;
            blocker.proceed?.();
          },
          onCancel: () => {
            blocker.reset?.();
          },
        }}
        onClose={closeContextSheet}
        onSaved={() => {
          dirtyRef.current = false;
          closeContextSheet();
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
