import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@owox/ui/components/sheet';
import toast from 'react-hot-toast';
import { extractApiError } from '../../../../app/api/extract-api-error.util';
import { useUnsavedGuard } from '../../../../hooks/useUnsavedGuard';
import { UnsavedChangesConfirmationDialog } from '../../../../shared/components/UnsavedChangesConfirmationDialog';
import type {
  CreateCredentialRequest,
  Credential,
  CredentialDefinition,
  UpdateCredentialRequest,
} from '../../types';
import { useCredentialActions } from '../../useCredentials';
import { CredentialForm } from './CredentialForm';

export interface CredentialConfigSheetProps {
  isOpen: boolean;
  onClose: () => void;
  credential: Credential | null;
  definitions: CredentialDefinition[];
  initialDefinitionId?: string;
  allowedDefinitionIds?: readonly string[];
  onCreated?: (credential: Credential) => void;
  onSaveSuccess?: (credential: Credential) => void;
  onRequestReplaceSecret?: (credential: Credential) => void;
  onRequestAddGithubDefinition?: (repository: string) => Promise<CredentialDefinition>;
  canManageAccess?: boolean;
  canAddGithubDefinition?: boolean;
}

export function CredentialConfigSheet({
  isOpen,
  onClose,
  credential,
  definitions,
  initialDefinitionId,
  allowedDefinitionIds,
  onCreated,
  onSaveSuccess,
  onRequestReplaceSecret,
  onRequestAddGithubDefinition,
  canManageAccess,
  canAddGithubDefinition = false,
}: CredentialConfigSheetProps) {
  const actions = useCredentialActions();
  const {
    showUnsavedDialog,
    setShowUnsavedDialog,
    handleClose,
    confirmClose,
    handleFormDirtyChange,
    handleFormSubmitSuccess,
  } = useUnsavedGuard(onClose);

  const save = async (input: CreateCredentialRequest | UpdateCredentialRequest) => {
    try {
      const saved = credential
        ? await actions.update({ id: credential.id, input: input as UpdateCredentialRequest })
        : await actions.create(input as CreateCredentialRequest);

      if (credential) {
        toast.success('Credential updated');
      } else {
        reportSavedValidation(saved, 'Credential created');
      }

      handleFormSubmitSuccess();
      if (!credential) onCreated?.(saved);
      onSaveSuccess?.(saved);
    } catch (caught) {
      const apiError = extractApiError(caught) as { message?: string } | undefined;
      toast.error(apiError?.message ?? 'Could not save the Credential');
    }
  };

  return (
    <Sheet
      open={isOpen}
      onOpenChange={open => {
        if (!open) handleClose();
      }}
    >
      <SheetContent data-testid='credentialConfigSheet'>
        <SheetHeader>
          <SheetTitle>{credential ? 'Edit Credential' : 'Add Credential'}</SheetTitle>
          <SheetDescription>
            {credential
              ? 'Customize access and sharing settings for this Credential.'
              : 'Add provider access that can be reused without exposing the secret.'}
          </SheetDescription>
        </SheetHeader>
        <CredentialForm
          key={`${credential?.id ?? 'create'}:${isOpen}`}
          credential={credential}
          definitions={definitions}
          initialDefinitionId={initialDefinitionId}
          allowedDefinitionIds={allowedDefinitionIds}
          isSaving={actions.isSaving}
          onSubmit={save}
          onCancel={handleClose}
          onDirtyChange={handleFormDirtyChange}
          onRequestReplaceSecret={onRequestReplaceSecret}
          canManageAccess={canManageAccess}
          onRequestAddGithubDefinition={
            onRequestAddGithubDefinition ??
            (allowedDefinitionIds === undefined && canAddGithubDefinition
              ? actions.addGithubDefinition
              : undefined)
          }
        />
        <UnsavedChangesConfirmationDialog
          open={showUnsavedDialog}
          onOpenChange={setShowUnsavedDialog}
          onConfirm={confirmClose}
        />
      </SheetContent>
    </Sheet>
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
