import type { ReactNode } from 'react';
import { focusFirstFormField } from '../../../../shared/utils';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@owox/ui/components/sheet';
import { CopyLinkButton } from '@owox/ui/components/common/copy-link-button';
import toast from 'react-hot-toast';
import { wasErrorToastShown } from '../../../../app/api';
import { extractApiError } from '../../../../app/api/extract-api-error.util';
import { useUnsavedGuard } from '../../../../hooks/useUnsavedGuard';
import { UnsavedChangesConfirmationDialog } from '../../../../shared/components/UnsavedChangesConfirmationDialog';
import type {
  CreateCredentialRequest,
  Credential,
  CredentialDefinition,
  CustomConnectorFieldSpec,
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
  /** Starts both sharing switches off for a new Credential. */
  defaultSharing?: 'not-shared';
  /** Hosts and field list a new custom connector Credential takes from the manifest. */
  customConnectorPrefill?: { hosts: string[]; fieldList: CustomConnectorFieldSpec[] };
  /** The page link that opens this Credential. */
  link?: string | null;
  providerLogo?: string | null;
  promo?: ReactNode;
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
  defaultSharing,
  customConnectorPrefill,
  link,
  providerLogo,
  promo,
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

  const finishSave = (saved: Credential, wasEdit: boolean) => {
    if (wasEdit) {
      toast.success('Credential updated');
    } else {
      reportSavedValidation(saved, 'Credential created');
    }

    // Before closing, so a caller can tell a finished create from one whose Sheet was closed.
    if (!wasEdit) onCreated?.(saved);
    handleFormSubmitSuccess();
    onSaveSuccess?.(saved);
  };

  const save = async (input: CreateCredentialRequest | UpdateCredentialRequest) => {
    try {
      const saved = credential
        ? await actions.update({ id: credential.id, input: input as UpdateCredentialRequest })
        : await actions.create(input as CreateCredentialRequest);

      finishSave(saved, Boolean(credential));
    } catch (caught) {
      if (wasErrorToastShown(caught)) return;
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
      <SheetContent
        data-testid='credentialConfigSheet'
        onOpenAutoFocus={promo ? focusFirstFormField : undefined}
      >
        <SheetHeader>
          <SheetTitle>{credential ? 'Edit Credential' : 'Add Credential'}</SheetTitle>
          <div className='flex w-full items-center gap-4'>
            <SheetDescription>
              {credential
                ? 'Customize access and sharing settings for this Credential.'
                : 'Add provider access that can be reused without exposing the secret.'}
            </SheetDescription>
            {link && <CopyLinkButton link={link} ariaLabel='Copy link to this Credential' />}
          </div>
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
          defaultSharing={defaultSharing}
          customConnectorPrefill={customConnectorPrefill}
          providerLogo={providerLogo}
          promo={promo}
          onOAuthConnected={saved => {
            finishSave(saved, Boolean(credential));
          }}
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
