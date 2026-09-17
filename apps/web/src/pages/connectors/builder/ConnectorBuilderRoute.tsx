import { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { usePermissions } from '../../../app/permissions';
import { ConnectorBuilderPage } from '../../../features/connector-builder/create/ConnectorBuilderPage';
import { useUnsavedChangesGuard } from '../../../features/connector-builder/shared/model/hooks/useUnsavedChangesGuard';
import { UnsavedChangesConfirmationDialog } from '../../../shared/components/UnsavedChangesConfirmationDialog';

interface ConnectorBuilderRouteProps {
  id?: string;
  onBack?: () => void;
  onCreated?: (id: string) => void;
}

/**
 * What a viewer sees instead of a builder that cannot load for them.
 *
 * Every write in the builder — create, save draft, publish, activate, delete — is
 * `@Auth(Role.editor())`, and so is the one read that returns a manifest verbatim
 * (`GET /connectors/custom/:id/versions/:version`), because a manifest is author-written
 * JSON that can carry a credential typed straight into this form. Without this, a viewer
 * opening a connector got a builder that failed to fetch and said nothing about why.
 */
function BuilderNotAuthorised({ onBack }: { onBack: () => void }) {
  return (
    <div
      className='flex h-full items-center justify-center p-8'
      data-testid='builder-not-authorised'
    >
      <div className='bg-card flex max-w-[460px] flex-col items-start gap-3 rounded-[10px] border p-[18px]'>
        <div className='flex items-center gap-2.5'>
          <ShieldAlert className='h-[18px] w-[18px] text-amber-500' strokeWidth={1.7} />
          <h3 className='text-foreground text-base font-medium'>
            The connector builder needs editor access
          </h3>
        </div>
        <p className='text-muted-foreground text-[13px] leading-relaxed'>
          A connector definition can contain credentials, so only editors and admins can open it.
          You can still browse the connectors list, and configure a connector on a Data Mart that
          already uses one.
        </p>
        <Button variant='outline' onClick={onBack} className='h-[34px]'>
          Back to connectors
        </Button>
      </div>
    </div>
  );
}

/** The builder plus the guard that holds back navigation while it has unsaved edits. */
function GuardedBuilder({ id, onBack, onCreated }: ConnectorBuilderRouteProps) {
  // A ref rather than state: nothing here re-renders on dirtiness, and the guard has to
  // read the flag at the instant a navigation is requested (see useUnsavedChangesGuard).
  const dirtyRef = useRef(false);
  const hasUnsavedChanges = useCallback(() => dirtyRef.current, []);
  const handleDirtyChange = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);
  const guard = useUnsavedChangesGuard(hasUnsavedChanges);

  return (
    <>
      <ConnectorBuilderPage
        id={id}
        onBack={onBack}
        onCreated={onCreated}
        onDirtyChange={handleDirtyChange}
      />
      <UnsavedChangesConfirmationDialog
        open={guard.blocked}
        onOpenChange={open => {
          // Covers the "No, stay here" button, Escape and an overlay click alike.
          if (!open) guard.cancelLeave();
        }}
        onConfirm={guard.confirmLeave}
      />
    </>
  );
}

/**
 * Route-level shell shared by /connectors/builder/new and /connectors/builder/:id: who may
 * open the builder, and what happens when they leave it with unsaved edits. Both need the
 * router (a role decision that must survive a deep link, and `useBlocker`), which is why
 * they live here rather than inside the builder feature.
 */
export function ConnectorBuilderRoute(props: ConnectorBuilderRouteProps) {
  // `canEdit` is the app's own admin-or-editor primitive, and the same hierarchy the
  // backend applies (its guard maps `editor` to ['editor', 'admin']). Not
  // `RoleGuard editorOnly`: that matches the literal `editor` role and would lock an
  // admin out of a builder every one of whose writes an admin is allowed to make.
  const { canEdit } = usePermissions();
  const navigate = useNavigate();
  // Path-relative so the /ui/:projectId prefix is preserved: both builder routes are two
  // segments below the connectors list.
  const backToConnectors = () => void navigate('../..', { relative: 'path' });

  if (!canEdit) return <BuilderNotAuthorised onBack={backToConnectors} />;
  return <GuardedBuilder {...props} />;
}
