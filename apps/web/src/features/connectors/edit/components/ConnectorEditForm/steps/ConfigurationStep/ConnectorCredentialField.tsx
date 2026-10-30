import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Button } from '@owox/ui/components/button';
import { AppWizardStepItem, AppWizardStepLabel } from '@owox/ui/components/common/wizard';
import {
  ConnectPickedSpreadsheetContext,
  ConsumerCredentialField,
  sourceAuthVariant,
  useCredentialDefinitions,
  useCredentials,
  type Credential,
  type CredentialSummary,
} from '../../../../../../credentials';
import type {
  CredentialRequirementDto,
  FittingCredentialsQuery,
} from '../../../../../../connector-builder/shared/api/types';
import { useTestCredentials } from '../../../../../../connector-builder/shared/model/hooks/useTestCredentials';

const FIELD_ID = 'connectorCredential';
const REASON_ID = `${FIELD_ID}-reason`;
const DELETED = "This Data Mart's Credential was deleted. Select another Credential.";
const UNAVAILABLE =
  "This Data Mart's Credential belongs to a connector that is no longer installed. Select another Credential.";
const NO_LONGER_FITS =
  "This Data Mart's Credential no longer fits its connector. Select a fitting Credential.";

interface ConnectorCredentialFieldProps {
  connectorName: string;
  /** The connector's AuthType variants; a Credential picks one. */
  variants: readonly string[];
  /** For a custom connector: the version the Data Mart runs, to fit Credentials and prefill a new one. */
  fitting?: FittingCredentialsQuery;
  /** The requirement the form already holds, when it does not depend on the selection. */
  requirement?: CredentialRequirementDto;
  isNew: boolean;
  value: string | null;
  summary: CredentialSummary | null;
  onOldKey: boolean;
  /** The Credential the saved configuration was bound to: it stays selected even when it no longer fits. */
  keptCredentialId?: string | null;
  /** Clears an unsaved pick that a new selection no longer fits. */
  onClear?: () => void;
  onChange: (
    credentialId: string,
    variant: string | undefined,
    source: 'existing' | 'created' | 'auto',
    /** The spreadsheet a Connect from this field picked for the Credential it created. */
    spreadsheetId?: string
  ) => void;
  children?: ReactNode;
}

/** Says the Credentials or what they must hold could not be loaded, with a retry. */
export function CredentialsLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role='alert' className='flex items-center gap-3 text-sm'>
      <span className='text-muted-foreground'>Could not load Credentials.</span>
      <Button type='button' variant='outline' size='sm' onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/** The Credential of a connector configuration, in place of its auth fields. */
export function ConnectorCredentialField({
  connectorName,
  variants,
  fitting,
  requirement,
  isNew,
  value,
  summary,
  onOldKey,
  keptCredentialId,
  onClear,
  onChange,
  children,
}: ConnectorCredentialFieldProps) {
  const { credentials } = useCredentials();
  const { definitions } = useCredentialDefinitions();
  // Named before onChange fires for it, while the list does not have it yet.
  const created = useRef<Credential | null>(null);
  const connectPick = useRef<{ credentialId: string; spreadsheetId: string } | null>(null);
  const takeConnectPick = useCallback((credentialId: string, spreadsheetId: string) => {
    connectPick.current = { credentialId, spreadsheetId };
  }, []);
  const { state: fit, retry } = useTestCredentials(fitting ?? null, 0, requirement);

  const ready = fitting && fit.status === 'ready' ? fit : undefined;

  // Only a fresh list judges the pick: a Credential created since the last list is not in it yet.
  const readyIds = ready?.ids;
  const latest = useRef({ value, keptCredentialId, onClear });
  latest.current = { value, keptCredentialId, onClear };
  useEffect(() => {
    const { value: picked, keptCredentialId: kept, onClear: clear } = latest.current;
    if (readyIds && picked && picked !== kept && !readyIds.includes(picked)) clear?.();
  }, [readyIds]);

  // A new configuration picks its only fitting Credential once, from the complete list.
  if (fitting && fit.status === 'loading') return null;

  // A new pick comes from the fitting list, so only the kept Credential can be refused.
  const refusal = ready && value && value === keptCredentialId ? ready.refusals[value] : undefined;
  const deleted = summary?.state === 'deleted';
  const unavailable = summary?.state === 'unavailable';
  let reason: string | undefined;
  if (deleted && !value) reason = DELETED;
  else if (unavailable && !value) reason = UNAVAILABLE;
  else if (refusal) reason = refusal.reason === 'unfit' ? NO_LONGER_FITS : refusal.message;

  const variantOf = (definitionId: string | undefined) => {
    if (!definitionId) return undefined;
    return (
      sourceAuthVariant(definitionId)?.variant ??
      // A reused definition (google-service-account) serves the variant no generated one does.
      variants.find(
        variant => !definitions.some(({ id }) => id === `source:${connectorName}:${variant}`)
      )
    );
  };

  return (
    <AppWizardStepItem>
      <AppWizardStepLabel
        htmlFor={FIELD_ID}
        required
        tooltip='Choose the Credential this configuration connects with'
      >
        Credential
      </AppWizardStepLabel>
      {fitting && fit.status === 'error' ? (
        <CredentialsLoadError onRetry={retry} />
      ) : (
        <ConnectPickedSpreadsheetContext.Provider value={takeConnectPick}>
          <ConsumerCredentialField
            id={FIELD_ID}
            consumer='connector-config'
            consumerType={connectorName}
            createdFrom='data-mart'
            isNew={isNew}
            value={value}
            // A deleted or unavailable Credential is not a restricted one: the field offers a new pick and the line below says why.
            summary={deleted || unavailable ? null : summary}
            aria-describedby={reason ? REASON_ID : undefined}
            allowedCredentialIds={ready?.ids}
            customConnectorPrefill={
              ready
                ? { hosts: ready.requirement.hosts, fieldList: ready.requirement.fieldList }
                : undefined
            }
            onCreated={credential => {
              created.current = credential;
            }}
            onChange={(id, source) => {
              const credential = credentials.find(item => item.id === id) ?? created.current;
              const pick = connectPick.current;
              connectPick.current = null;
              onChange(
                id,
                variantOf(credential?.definition.id),
                source,
                pick?.credentialId === id ? pick.spreadsheetId : undefined
              );
            }}
          />
        </ConnectPickedSpreadsheetContext.Provider>
      )}
      {onOldKey && (
        <p className='text-muted-foreground text-sm'>
          Uses its own key until you select a Credential
        </p>
      )}
      {reason && (
        <p id={REASON_ID} className='text-destructive text-sm'>
          {reason}
        </p>
      )}
      {children}
    </AppWizardStepItem>
  );
}
