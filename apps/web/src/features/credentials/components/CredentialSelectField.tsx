import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@owox/ui/components/button';
import { Combobox, type ComboboxOption } from '../../../shared/components/Combobox/combobox';
import type { Credential, CredentialIcon, CredentialSummary } from '../types';
import { useCredentialDefinitions, useCredentials } from '../useCredentials';
import { CredentialConfigSheet } from './CredentialConfigSheet';
import { ProviderIcon } from './ProviderCombobox';

const CREATE_VALUE = '__create_credential__';

interface CredentialItem {
  id: string;
  title: string;
  identity: string | null;
  providerName: string;
  icon?: CredentialIcon | null;
}

export interface CredentialSelectFieldProps {
  /** Definitions the field offers and the create form allows. */
  allowedDefinitionIds: readonly string[];
  isNew: boolean;
  value: string | null;
  summary: CredentialSummary | null | undefined;
  onChange: (id: string, source: 'existing' | 'created' | 'auto') => void;
  /** Says why the kept Credential is unusable; rendered under the field while the binding is kept. */
  renderStateMark?: (summary: CredentialSummary) => ReactNode;
  /** Called for every Credential created from the field's sheet. */
  onCreated?: (credential: Credential) => void;
  // Given by the form's FormControl.
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

const toItem = (credential: Credential): CredentialItem => ({
  id: credential.id,
  title: credential.title,
  identity: credential.identity ?? null,
  providerName: credential.definition.displayName,
  icon: credential.definition.icon,
});

export function CredentialSelectField({
  allowedDefinitionIds: allowedIds,
  isNew,
  value,
  summary: summaryProp,
  onChange,
  onCreated,
  renderStateMark,
  id,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: CredentialSelectFieldProps) {
  const summary = summaryProp ?? null;
  const credentialsQuery = useCredentials();
  const definitionsQuery = useCredentialDefinitions();
  const { credentials } = credentialsQuery;
  const { definitions } = definitionsQuery;
  // Fitting Credentials and the create form both need the definitions, so wait for both lists.
  const isLoading = credentialsQuery.isLoading || definitionsQuery.isLoading;
  const isError = credentialsQuery.isError || definitionsQuery.isError;
  const refetch = () =>
    Promise.all([
      credentialsQuery.isError ? credentialsQuery.refetch() : null,
      definitionsQuery.isError ? definitionsQuery.refetch() : null,
    ]);
  // Token of the open create Sheet; a call from an earlier or closed Sheet is ignored.
  const [creating, setCreating] = useState<number | null>(null);
  const openSeq = useRef(0);
  const focusField = () => {
    if (id) requestAnimationFrame(() => document.getElementById(id)?.focus());
  };
  // Shown until the refetched list has it.
  const [created, setCreated] = useState<Credential | null>(null);

  const fitting = credentials.filter(
    credential =>
      allowedIds.includes(credential.definition.id) &&
      credential.enabled &&
      credential.canUse !== false
  );
  const items = fitting.map(toItem);
  if (created && !items.some(item => item.id === created.id)) items.push(toItem(created));
  // The bound Credential stays shown even when it is no longer offered (e.g. disabled).
  if (summary?.access === 'visible' && !items.some(item => item.id === summary.id)) {
    const icon = definitions.find(definition => definition.id === summary.definitionId)?.icon;
    items.unshift({ ...summary, icon });
  }
  const itemsById = new Map(items.map(item => [item.id, item]));

  const onlyFittingId = fitting.length === 1 ? fitting[0].id : null;
  // Decided once, on the first loaded list: a Credential that appears later is not picked for the user.
  const autoSelectDecidedRef = useRef(false);
  useEffect(() => {
    if (isLoading || isError || autoSelectDecidedRef.current) return;
    autoSelectDecidedRef.current = true;
    if (isNew && !value && onlyFittingId) onChange(onlyFittingId, 'auto');
  }, [isLoading, isError, isNew, value, onlyFittingId, onChange]);

  const keepsBinding =
    summary !== null && (summary.access === 'visible' ? value === summary.id : !value);

  let placeholder = 'Select a Credential';
  if (isLoading) placeholder = 'Loading...';
  else if (summary?.access === 'restricted' && !value) placeholder = 'Restricted Credential';
  else if (items.length === 0 && !isError) placeholder = 'No Credentials yet';

  const options: ComboboxOption[] = [
    ...items.map(item => ({
      value: item.id,
      label: item.title,
      keywords: [item.title, item.identity ?? '', item.providerName],
    })),
    {
      value: CREATE_VALUE,
      label: '+ Create new Credential',
      separator: items.length > 0,
      forceMount: true,
    },
  ];

  return (
    <>
      <Combobox
        id={id}
        ariaInvalid={ariaInvalid}
        ariaDescribedBy={ariaDescribedBy}
        options={options}
        value={value ?? ''}
        onValueChange={next => {
          if (next === CREATE_VALUE) {
            openSeq.current += 1;
            setCreating(openSeq.current);
            return;
          }
          onChange(next, 'existing');
        }}
        ariaLabel='Credential'
        placeholder={placeholder}
        emptyMessage='No Credentials found'
        disabled={isLoading || isError}
        className='w-full'
        renderLabel={(option, context) => {
          const item = itemsById.get(option.value);
          if (!item) return <span className='min-w-0 flex-1 truncate'>{option.label}</span>;
          const details = [item.identity, item.providerName].filter(Boolean).join(' · ');
          return context === 'trigger' ? (
            <span className='flex min-w-0 items-center gap-2'>
              <ProviderIcon icon={item.icon} />
              <span className='truncate'>
                {item.title} <span className='text-muted-foreground'>· {details}</span>
              </span>
            </span>
          ) : (
            <span className='flex min-w-0 flex-1 items-center gap-2'>
              <ProviderIcon icon={item.icon} />
              <span className='flex min-w-0 flex-col'>
                <span className='truncate'>{item.title}</span>
                <span className='text-muted-foreground truncate text-xs'>{details}</span>
              </span>
            </span>
          );
        }}
      />
      {keepsBinding && renderStateMark?.(summary)}
      {isError && (
        <div role='alert' className='flex items-center gap-3 text-sm'>
          <span className='text-muted-foreground'>Could not load Credentials.</span>
          <Button type='button' variant='outline' size='sm' onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}
      {creating !== null && (
        // The Sheet portals out of the host form, but React still bubbles its submit up to it.
        <div
          onSubmit={event => {
            event.stopPropagation();
          }}
        >
          <CredentialConfigSheet
            isOpen
            onClose={() => {
              if (openSeq.current !== creating) return;
              openSeq.current += 1;
              setCreating(null);
              focusField();
            }}
            credential={null}
            definitions={definitions}
            allowedDefinitionIds={[...allowedIds]}
            initialDefinitionId={allowedIds.length === 1 ? allowedIds[0] : undefined}
            defaultSharing='not-shared'
            onCreated={credential => {
              onCreated?.(credential);
              if (openSeq.current !== creating) return;
              setCreated(credential);
              onChange(credential.id, 'created');
              focusField();
            }}
          />
        </div>
      )}
    </>
  );
}
