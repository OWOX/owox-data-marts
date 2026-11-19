import { type RefObject, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import { ChangeRoleHint } from '../../../features/project-members/components/ChangeRoleHint';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { usePermissions } from '../../../app/permissions';
import {
  ConnectorBuilderPage,
  type BuilderEntryPoint,
} from '../../../features/connector-builder/create/ConnectorBuilderPage';
import type { BuilderTestPrefill } from '../../../features/connector-builder/shared/model/testLink';
import { useUnsavedChangesGuard } from '../../../shared/hooks';
import { useBuilder } from '../../../features/connector-builder/shared/model/hooks/useBuilder';
import { McpPromoCard, buildMcpPrompt, useIsMcpPromoAvailable } from '../../../features/mcp-promo';
import { useProjectId } from '../../../shared/hooks/useProjectId';
import { UnsavedChangesConfirmationDialog } from '../../../shared/components/UnsavedChangesConfirmationDialog';

interface ConnectorBuilderRouteProps {
  id?: string;
  entryPoint?: BuilderEntryPoint;
  testPrefill?: BuilderTestPrefill;
  onBack?: () => void;
  onDeleted?: () => void;
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
            The connector builder needs the Data Owner role
          </h3>
        </div>
        <p className='text-muted-foreground text-[13px] leading-relaxed'>
          A connector definition can contain credentials, so only members with the Data Owner or
          Project Admin role can open it. You can still browse the connectors list.{' '}
          <ChangeRoleHint to='../../../project-settings/members' relative='path' />
        </p>
        <Button variant='outline' onClick={onBack} className='h-[34px]'>
          Back to connectors
        </Button>
      </div>
    </div>
  );
}

type BuilderPromoPlacement = 'connector_builder' | 'connector_builder_maintain';

function BuilderMcpPromo({
  connectorId,
  shownRefs,
}: {
  connectorId?: string;
  shownRefs: Record<BuilderPromoPlacement, RefObject<boolean>>;
}) {
  const projectId = useProjectId();
  const isAvailable = useIsMcpPromoAvailable();
  const { state } = useBuilder();
  if (!projectId || !isAvailable) return null;

  const placement: BuilderPromoPlacement =
    connectorId && state.activeVersionId !== null
      ? 'connector_builder_maintain'
      : 'connector_builder';
  return (
    <div className='-mb-0.5 px-6 pt-6 empty:hidden'>
      <McpPromoCard
        key={placement}
        placement={placement}
        mcpPart='setup'
        title={
          placement === 'connector_builder'
            ? 'Build it with your AI assistant'
            : 'Maintain it with your AI assistant'
        }
        prompt={buildMcpPrompt(placement, { projectId, connectorId })}
        shownRef={shownRefs[placement]}
      />
    </div>
  );
}

/** The builder plus the guard that holds back navigation while it has unsaved edits. */
function GuardedBuilder({
  id,
  entryPoint,
  testPrefill,
  onBack,
  onDeleted,
  onCreated,
}: ConnectorBuilderRouteProps) {
  // A ref rather than state: nothing here re-renders on dirtiness, and the guard has to
  // read the flag at the instant a navigation is requested (see useUnsavedChangesGuard).
  const dirtyRef = useRef(false);
  const hasUnsavedChanges = useCallback(() => dirtyRef.current, []);
  const handleDirtyChange = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);
  const guard = useUnsavedChangesGuard(hasUnsavedChanges);
  // A Builder/Code switch remounts the promo; these keep shown to one event per visit.
  const promoShownRefs = useRef({
    connector_builder: { current: false },
    connector_builder_maintain: { current: false },
  });
  // Cleared here, not left to the builder's report of it: that arrives a render later, after
  // the navigation it would have to let through.
  const handleDeleted = useCallback(() => {
    dirtyRef.current = false;
    onDeleted?.();
  }, [onDeleted]);

  return (
    <>
      <ConnectorBuilderPage
        id={id}
        entryPoint={entryPoint}
        testPrefill={testPrefill}
        onBack={onBack}
        onDeleted={handleDeleted}
        onCreated={onCreated}
        onDirtyChange={handleDirtyChange}
        promo={
          testPrefill ? undefined : (
            <BuilderMcpPromo connectorId={id} shownRefs={promoShownRefs.current} />
          )
        }
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
  // A deleted connector has no page to go back to, and going back in history left the app
  // when the builder was opened from a link.
  return <GuardedBuilder onDeleted={backToConnectors} {...props} />;
}
