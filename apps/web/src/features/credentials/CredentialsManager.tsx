import { Button } from '@owox/ui/components/button';
import { KeyRound, Plus } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { wasErrorToastShown } from '../../app/api';
import { extractApiError } from '../../app/api/extract-api-error.util';
import { useAuth } from '../idp';
import { ConfirmationDialog } from '../../shared/components/ConfirmationDialog/ConfirmationDialog';
import { isUnavailableCredential, type Credential, type UnavailableCredential } from './types';
import { CredentialConfigSheet, CredentialUsedByList } from './components/CredentialConfigSheet';
import { ReplaceSecretDialog } from './components/ReplaceSecretDialog';
import { CredentialsTable } from './CredentialsTable';
import { credentialDeleteBlockedMessage } from './credential-delete-message';
import { servedConnector } from './served-connector';
import { trackCredentialCreated } from './track-credential-created';
import { useCredentialActions, useCredentialDefinitions, useCredentials } from './useCredentials';
import { useCredentialPermissions } from './useCredentialPermissions';

export function CredentialsManager() {
  const { user } = useAuth();
  const permissions = useCredentialPermissions();
  const { credentials, unavailableCredentials, isLoading, isError, refetch } = useCredentials();
  const {
    definitions,
    isLoading: definitionsLoading,
    isError: definitionsError,
    refetch: refetchDefinitions,
  } = useCredentialDefinitions();
  const actions = useCredentialActions();
  const [editor, setEditor] = useState<{ open: boolean; credential: Credential | null }>({
    open: false,
    credential: null,
  });
  const [rotating, setRotating] = useState<Credential | null>(null);
  const [deleting, setDeleting] = useState<Credential | UnavailableCredential | null>(null);

  const deletingUsedBy = deleting && !isUnavailableCredential(deleting) ? deleting.usedBy : [];

  const fail = (caught: unknown, fallback: string) => {
    if (wasErrorToastShown(caught)) return;
    const apiError = extractApiError(caught) as { message?: string } | undefined;
    toast.error(apiError?.message ?? fallback);
  };

  const validate = async (credential: Credential) => {
    try {
      const result = await actions.validate(credential.id);
      if (result.validationState === 'verified') {
        toast.success('Credential accepted by the provider');
      } else if (result.validationState === 'rejected') {
        toast.error(result.validationMessage ?? 'Provider rejected this Credential');
      } else {
        toast(result.validationMessage ?? 'Credential could not be verified');
      }
    } catch (caught) {
      fail(caught, 'Could not validate the Credential');
    }
  };

  const toggleEnabled = async (credential: Credential) => {
    try {
      await actions.update({ id: credential.id, input: { enabled: !credential.enabled } });
      toast.success(credential.enabled ? 'Credential disabled' : 'Credential enabled');
    } catch (caught) {
      fail(caught, 'Could not update the Credential');
    }
  };

  const acceptDefinitionUpdate = async (credential: Credential) => {
    try {
      await actions.consentDefinition(credential.id);
      toast.success('Definition update accepted');
    } catch (caught) {
      fail(caught, 'Could not accept the definition update');
    }
  };

  return (
    <div className='flex flex-col gap-4'>
      {definitionsError && (
        <div role='alert' className='flex items-center gap-3 text-sm'>
          <span className='text-muted-foreground'>Could not load providers.</span>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => void refetchDefinitions()}
          >
            Try again
          </Button>
        </div>
      )}
      {isLoading ? (
        <div className='text-muted-foreground py-12 text-center text-sm'>Loading Credentials…</div>
      ) : isError ? (
        <div className='flex flex-col items-center gap-3 py-12 text-sm'>
          <span className='text-muted-foreground'>Could not load Credentials.</span>
          <Button variant='outline' onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : credentials.length === 0 && unavailableCredentials.length === 0 ? (
        <div className='flex flex-col items-center gap-3 rounded-lg border border-dashed py-12'>
          <KeyRound className='text-muted-foreground size-8' />
          <div className='text-center'>
            <div className='font-medium'>No Credentials yet</div>
            <div className='text-muted-foreground text-sm'>
              Add a provider key to reuse it without exposing the secret.
            </div>
          </div>
          <Button
            onClick={() => {
              setEditor({ open: true, credential: null });
            }}
            disabled={definitionsLoading || definitions.length === 0}
          >
            <Plus className='size-4' /> Add Credential
          </Button>
        </div>
      ) : (
        <CredentialsTable
          credentials={credentials}
          unavailableCredentials={unavailableCredentials}
          canDeleteUnavailable={Boolean(user?.roles?.includes('admin'))}
          canAddCredential={!definitionsLoading && definitions.length > 0}
          canMaintainCredential={permissions.canMaintain}
          isValidating={actions.isValidating}
          onAddCredential={() => {
            setEditor({ open: true, credential: null });
          }}
          onValidate={credential => void validate(credential)}
          onReplaceSecret={credential => {
            // Field sets, custom connectors and Google accounts are changed in the form, not as one secret.
            if (
              credential.definition.auth?.type === 'fields' ||
              credential.definition.auth?.type === 'custom-connector' ||
              credential.definition.auth?.type === 'oauth'
            ) {
              setEditor({ open: true, credential });
            } else {
              setRotating(credential);
            }
          }}
          onEdit={credential => {
            setEditor({ open: true, credential });
          }}
          onToggleEnabled={credential => void toggleEnabled(credential)}
          onAcceptDefinition={credential => void acceptDefinitionUpdate(credential)}
          onDelete={setDeleting}
        />
      )}

      <CredentialConfigSheet
        key={`${editor.credential?.id ?? 'create'}:${editor.open}`}
        isOpen={editor.open}
        credential={editor.credential}
        definitions={definitions}
        canManageAccess={permissions.canManageAccess(editor.credential)}
        canAddGithubDefinition={Boolean(user?.roles?.includes('admin'))}
        onClose={() => {
          setEditor({ open: false, credential: null });
        }}
        onRequestReplaceSecret={setRotating}
        onCreated={credential => {
          const { definition } = credential;
          // Only Source Credentials are reported, as on the Data Mart form and the builder.
          if (definition.id.startsWith('source:') || definition.auth?.type === 'custom-connector') {
            trackCredentialCreated(
              'connector-config',
              servedConnector(definition) ?? 'custom connector',
              credential,
              'credentials-page'
            );
          }
        }}
      />

      <ReplaceSecretDialog
        key={rotating?.id ?? 'none'}
        credential={rotating}
        isSaving={actions.isSaving}
        onOpenChange={open => {
          if (!open) setRotating(null);
        }}
        onReplace={async secret => {
          if (!rotating) return;
          try {
            const updated = await actions.update({
              id: rotating.id,
              input: { secret: { value: secret } },
            });
            setRotating(null);
            reportSavedValidation(updated, 'Secret replaced');
          } catch (caught) {
            fail(caught, 'Could not replace the secret');
          }
        }}
      />

      <ConfirmationDialog
        open={deleting !== null}
        onOpenChange={open => {
          if (!open) setDeleting(null);
        }}
        title='Delete this Credential?'
        description={
          deletingUsedBy.length
            ? credentialDeleteBlockedMessage(deletingUsedBy)
            : 'The stored secret and its sharing configuration will be deleted.'
        }
        confirmLabel={actions.isDeleting ? 'Deleting…' : 'Delete'}
        confirmDisabled={actions.isDeleting || deletingUsedBy.length > 0}
        onConfirm={() => {
          if (!deleting) return;
          void actions
            .remove(deleting.id)
            .then(() => {
              setDeleting(null);
              toast.success('Credential deleted');
            })
            .catch((caught: unknown) => {
              fail(caught, 'Could not delete the Credential');
            });
        }}
      >
        {deleting && !isUnavailableCredential(deleting) && deletingUsedBy.length > 0 && (
          <CredentialUsedByList credential={deleting} />
        )}
      </ConfirmationDialog>
    </div>
  );
}

function reportSavedValidation(credential: Credential, action: string): void {
  if (credential.validationState === 'verified') {
    toast.success(`${action}; the provider accepted it`);
    return;
  }
  if (credential.validatedAt) {
    toast(`${action}; provider validation was inconclusive`);
    return;
  }
  toast.success(action);
}
