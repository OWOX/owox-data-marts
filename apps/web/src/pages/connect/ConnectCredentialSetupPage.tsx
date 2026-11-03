import { Button } from '@owox/ui/components/button';
import { CopyableField } from '@owox/ui/components/common/copyable-field';
import type { AxiosError } from 'axios';
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { CredentialForm } from '../../features/credentials/components/CredentialConfigSheet/CredentialForm';
import { ReplaceSecretDialog } from '../../features/credentials/components/ReplaceSecretDialog';
import { useCredentialPermissions } from '../../features/credentials/useCredentialPermissions';
import { useCredentialSetup } from '../../features/credentials/useCredentialSetup';
import { CredentialSetupRecoveryContext } from '../../features/credentials/credential-setup-recovery';
import { useAuth } from '../../features/idp';

export function ConnectCredentialSetupPage() {
  const { projectId, setupId = '' } = useParams<{ projectId: string; setupId: string }>();
  const { user } = useAuth();
  return (
    <main className='bg-card text-card-foreground flex max-h-[calc(100dvh-4rem)] min-h-0 w-full max-w-2xl flex-col overflow-y-auto rounded-lg p-4 shadow-lg sm:p-6'>
      <CredentialSetupContent key={`${projectId}:${user?.id}:${setupId}`} setupId={setupId} />
    </main>
  );
}

function CredentialSetupContent({ setupId }: { setupId: string }) {
  const flow = useCredentialSetup(setupId);
  const permissions = useCredentialPermissions();
  const [replacingSecret, setReplacingSecret] = useState(false);
  const { setup, credential } = flow;

  if (flow.setupNotFound) {
    return (
      <SetupMessage title='Setup link unavailable'>
        <p>This setup link is no longer available. Return to your chat to request a new link.</p>
        {flow.savedCredentialId && (
          <SavedCredentialRecovery credentialId={flow.savedCredentialId} />
        )}
      </SetupMessage>
    );
  }
  if (flow.loadError) {
    const forbidden = (flow.loadError as AxiosError).response?.status === 403;
    return (
      <SetupMessage title={forbidden ? 'Access denied' : 'Could not load setup'}>
        <p>
          {forbidden
            ? 'Open setup with the account and project used to start it. To update a Credential, you need edit access.'
            : 'OWOX could not load the setup request, provider, or Credential.'}
        </p>
        <Button variant='outline' onClick={() => void flow.retryLoad()}>
          Try again
        </Button>
        {flow.savedCredentialId && (
          <SavedCredentialRecovery credentialId={flow.savedCredentialId} />
        )}
      </SetupMessage>
    );
  }
  if (flow.isLoading || !setup) {
    return (
      <SetupMessage title='Credential setup'>
        <p role='status'>Loading setup…</p>
      </SetupMessage>
    );
  }
  if (setup.status === 'completed') {
    return (
      <SetupMessage title='Credential saved'>
        <p>Setup is complete. Return to your chat to continue. You can close this tab.</p>
        {flow.savedCredentialId && flow.savedCredentialId !== setup.credentialId && (
          <SavedCredentialRecovery credentialId={flow.savedCredentialId} />
        )}
      </SetupMessage>
    );
  }
  if (setup.status === 'cancelled' || setup.status === 'expired') {
    return (
      <SetupMessage title={setup.status === 'cancelled' ? 'Setup cancelled' : 'Setup expired'}>
        <p>Return to your chat to start a new setup request.</p>
        {flow.savedCredentialId && (
          <SavedCredentialRecovery credentialId={flow.savedCredentialId} />
        )}
      </SetupMessage>
    );
  }
  if (flow.savedCredentialId) {
    return (
      <SetupMessage title='Complete setup'>
        <p>OWOX saved your Credential.</p>
        {flow.operation === 'completing' ? (
          <p role='status'>Finishing setup…</p>
        ) : (
          <>
            {flow.actionError && (
              <p role='alert' className='text-destructive'>
                {flow.actionError}
              </p>
            )}
            <Button disabled={flow.operation !== null} onClick={() => void flow.retryCompletion()}>
              Retry completion
            </Button>
            <p>Complete setup to continue in your chat.</p>
          </>
        )}
      </SetupMessage>
    );
  }
  if (setup.mode === 'update' && (!credential || !permissions.canMaintain(credential))) {
    return (
      <SetupMessage title='Access denied'>
        <p>You need permission to edit this Credential.</p>
      </SetupMessage>
    );
  }
  if ((setup.definitionId && !flow.definition) || flow.definitions.length === 0) {
    return (
      <SetupMessage title='Provider unavailable'>
        <p>
          This provider is no longer available. Return to your chat to start another setup request.
        </p>
        <Button variant='outline' onClick={() => void flow.cancel()}>
          Cancel setup
        </Button>
        {flow.actionError && (
          <p role='alert' className='text-destructive'>
            {flow.actionError}
          </p>
        )}
      </SetupMessage>
    );
  }
  if (flow.definition?.auth?.type === 'oauth' && flow.oauthAvailable === false) {
    return (
      <SetupMessage title='Provider unavailable'>
        <p>
          Google sign-in is not configured on this server. Ask your administrator to configure it.
        </p>
      </SetupMessage>
    );
  }

  return (
    <>
      <header className='mb-4 shrink-0 space-y-2'>
        <h1 className='text-lg font-semibold'>
          {setup.mode === 'update' ? 'Update Credential' : 'Add Credential'}
        </h1>
        <p className='text-muted-foreground text-sm'>
          {setup.mode === 'update'
            ? 'Update this Credential to continue setup.'
            : 'Enter your provider credentials here. Keep secrets out of your chat. New Credentials are not shared.'}
        </p>
      </header>
      {flow.actionError && !replacingSecret && (
        <p role='alert' className='text-destructive mb-4 text-sm'>
          {flow.actionError}
        </p>
      )}
      {/* Keep the form in the card's flex layout while the fieldset disables its controls. */}
      <fieldset
        disabled={flow.operation !== null}
        className='contents'
        aria-busy={flow.operation !== null}
      >
        <CredentialSetupRecoveryContext.Provider value={flow.recordOAuthSave}>
          <CredentialForm
            credential={credential}
            definitions={flow.definitions}
            initialDefinitionId={setup.definitionId ?? undefined}
            initialTitle={setup.title ?? undefined}
            allowedDefinitionIds={setup.definitionId ? [setup.definitionId] : undefined}
            isSaving={flow.operation !== null}
            onSubmit={flow.save}
            onCancel={() => void flow.cancel()}
            onOAuthConnected={saved => void flow.onOAuthConnected(saved)}
            onRequestReplaceSecret={() => {
              setReplacingSecret(true);
            }}
            canManageAccess={permissions.canManageAccess(credential)}
            defaultSharing='not-shared'
          />
        </CredentialSetupRecoveryContext.Provider>
      </fieldset>
      <ReplaceSecretDialog
        key={`${credential?.id}:${replacingSecret}`}
        credential={replacingSecret ? credential : null}
        isSaving={flow.operation !== null}
        error={flow.actionError}
        onOpenChange={setReplacingSecret}
        onReplace={secret => flow.save({ secret: { value: secret } })}
      />
    </>
  );
}

function SavedCredentialRecovery({ credentialId }: { credentialId: string }) {
  const { projectId } = useParams<{ projectId: string }>();
  return (
    <div className='space-y-3'>
      <p>OWOX saved your Credential. Share this ID in your chat to reuse it.</p>
      <CopyableField value={credentialId}>{credentialId}</CopyableField>
      <Button asChild variant='outline'>
        <Link to={`/ui/${projectId}/credentials`}>Open Credentials</Link>
      </Button>
    </div>
  );
}

function SetupMessage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className='space-y-4'>
      <h1 className='text-lg font-semibold'>{title}</h1>
      <div className='text-muted-foreground space-y-4 text-sm'>{children}</div>
    </div>
  );
}
