import { Button } from '@owox/ui/components/button';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@owox/ui/components/dialog';
import { Input } from '@owox/ui/components/input';
import { Label } from '@owox/ui/components/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { Info, KeyRound, Plus } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { extractApiError } from '../../app/api/extract-api-error.util';
import { useAuth } from '../idp';
import { ConfirmationDialog } from '../../shared/components/ConfirmationDialog/ConfirmationDialog';
import type { Credential } from './types';
import { CredentialConfigSheet, CredentialUsedByList } from './components/CredentialConfigSheet';
import { CredentialsTable } from './CredentialsTable';
import { safeCredentialDocumentationUrl } from './credential-documentation-url';
import { useCredentialActions, useCredentialDefinitions, useCredentials } from './useCredentials';

export function CredentialsManager() {
  const { user } = useAuth();
  const { credentials, isLoading, isError, refetch } = useCredentials();
  const { definitions, isLoading: definitionsLoading } = useCredentialDefinitions();
  const actions = useCredentialActions();
  const [editor, setEditor] = useState<{ open: boolean; credential: Credential | null }>({
    open: false,
    credential: null,
  });
  const [rotating, setRotating] = useState<Credential | null>(null);
  const [deleting, setDeleting] = useState<Credential | null>(null);

  const fail = (caught: unknown, fallback: string) => {
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
      {isLoading ? (
        <div className='text-muted-foreground py-12 text-center text-sm'>Loading Credentials…</div>
      ) : isError ? (
        <div className='flex flex-col items-center gap-3 py-12 text-sm'>
          <span className='text-muted-foreground'>Could not load Credentials.</span>
          <Button variant='outline' onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : credentials.length === 0 ? (
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
          canAddCredential={!definitionsLoading && definitions.length > 0}
          canMaintainCredential={credential =>
            Boolean(user?.roles?.includes('admin')) ||
            credential.availableForMaintenance ||
            credential.ownerUsers.some(owner => owner.userId === user?.id)
          }
          isValidating={actions.isValidating}
          onAddCredential={() => {
            setEditor({ open: true, credential: null });
          }}
          onValidate={credential => void validate(credential)}
          onReplaceSecret={setRotating}
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
        canManageAccess={
          editor.credential === null ||
          Boolean(user?.roles?.includes('admin')) ||
          editor.credential.ownerUsers.some(owner => owner.userId === user?.id)
        }
        canAddGithubDefinition={Boolean(user?.roles?.includes('admin'))}
        onClose={() => {
          setEditor({ open: false, credential: null });
        }}
        onRequestReplaceSecret={setRotating}
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
          deleting?.usedBy.length
            ? `It is still used by ${deleting.usedBy.length} consumer(s). Remove those bindings first.`
            : 'The stored secret and its sharing configuration will be deleted.'
        }
        confirmLabel={actions.isDeleting ? 'Deleting…' : 'Delete'}
        confirmDisabled={actions.isDeleting || Boolean(deleting?.usedBy.length)}
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
        {deleting && deleting.usedBy.length > 0 && <CredentialUsedByList credential={deleting} />}
      </ConfirmationDialog>
    </div>
  );
}

function ReplaceSecretDialog({
  credential,
  isSaving,
  onOpenChange,
  onReplace,
}: {
  credential: Credential | null;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onReplace: (secret: string) => Promise<void>;
}) {
  const [secret, setSecret] = useState('');
  const documentationUrl = safeCredentialDocumentationUrl(credential?.definition.documentationUrl);
  return (
    <Dialog open={credential !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Replace secret</DialogTitle>
          <DialogDescription>
            Consumers continue using this Credential and will receive the new secret on their next
            request.
          </DialogDescription>
        </DialogHeader>
        {credential && credential.usedBy.length > 0 && (
          <CredentialUsedByList credential={credential} />
        )}
        <Field label='New secret'>
          <Input
            type='password'
            autoComplete='new-password'
            value={secret}
            onChange={event => {
              setSecret(event.target.value);
            }}
            maxLength={32_768}
          />
          {documentationUrl && (
            <ExternalAnchor href={documentationUrl} className='w-fit text-sm'>
              How to get this key
            </ExternalAnchor>
          )}
        </Field>
        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button disabled={isSaving || !secret} onClick={() => void onReplace(secret)}>
            {isSaving ? 'Replacing…' : 'Replace secret'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  tooltip,
  children,
}: {
  label: string;
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <div className='flex flex-col gap-1.5'>
      <FieldLabel label={label} tooltip={tooltip} />
      {children}
    </div>
  );
}

function FieldLabel({ label, tooltip }: { label: string; tooltip?: string }) {
  return (
    <div className='flex items-center gap-1.5'>
      <Label>{label}</Label>
      {tooltip && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button type='button' aria-label={`${label} information`}>
              <Info
                className='text-muted-foreground/50 hover:text-muted-foreground size-4 shrink-0 transition-colors'
                aria-hidden='true'
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side='top' align='center' role='tooltip' className='max-w-72'>
            {tooltip}
          </TooltipContent>
        </Tooltip>
      )}
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
