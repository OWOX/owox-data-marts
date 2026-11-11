import { Plus } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import {
  CredentialConfigSheet,
  isCredentialEligible,
  useCredentialDefinitions,
} from '../../credentials';
import type { NormalizedPluginCredentialRequirement } from '../../credentials/types';
import { Combobox, type ComboboxOption } from '../../../shared/components/Combobox/combobox';
import { OWOX_AI_SELECTION, getRequirementPresentation } from '../credentialRequirements';
import type { CredentialSelectionsForm } from '../hooks/useCredentialSelectionsForm';

const DO_NOT_GRANT_VALUE = '__none__';
const ADD_CREDENTIAL_VALUE = '__add_credential__';

/**
 * One Credential picker per requirement a plugin declares, with inline creation of a
 * matching Credential. Used by the install dialog and the plugin's Credentials tab.
 */
export function PluginCredentialFields({
  form,
  disabled = false,
  tiles = false,
  onAddCredential,
}: {
  form: CredentialSelectionsForm;
  disabled?: boolean;
  /** One white block per requirement, as form fields sit on a page; plain rows in a dialog. */
  tiles?: boolean;
  /** Opens the Credential creation flow preconfigured for this requirement. */
  onAddCredential?: (requirement: NormalizedPluginCredentialRequirement) => void;
}) {
  const { definitions, isLoading: definitionsLoading } = useCredentialDefinitions();
  const [creatingRequirement, setCreatingRequirement] =
    useState<NormalizedPluginCredentialRequirement | null>(null);
  const allowedDefinitionIds = useMemo(
    () => (creatingRequirement ? compatibleDefinitionIds(creatingRequirement, definitions) : []),
    [creatingRequirement, definitions]
  );
  const { credentialsLoading, credentialsFailed } = form;
  const noteId = useId();

  return (
    <>
      {credentialsFailed && (
        <p className='text-destructive text-sm' role='alert'>
          Could not load the project's Credentials. Reload the page to choose them.
        </p>
      )}
      {form.requirements.map(requirement => {
        const eligible = form.eligibleByKey.get(requirement.key) ?? [];
        const selected = Object.prototype.hasOwnProperty.call(form.selections, requirement.key)
          ? form.selections[requirement.key]
          : undefined;
        const hasDecision = form.isDecided(requirement.key);
        // A grant kept from before whose Credential is disabled, deleted or no longer fits.
        const grantUnusable =
          typeof selected === 'string' && !hasDecision && !credentialsLoading && !credentialsFailed;
        const showOwoxAi = form.offersOwoxAi(requirement);
        const owoxAiUnusable = form.owoxAiChoiceUnusable(requirement);
        const showSelectionError =
          form.touched.has(requirement.key) && !hasDecision && (eligible.length > 0 || showOwoxAi);
        const showOwoxAiNote = selected === OWOX_AI_SELECTION;
        const presentation = getRequirementPresentation(
          requirement,
          definitions,
          form.availableCredentials,
          showOwoxAi
        );
        const canAddCredential =
          Boolean(onAddCredential) ||
          (!definitionsLoading && compatibleDefinitionIds(requirement, definitions).length > 0);
        const credentialOptions: ComboboxOption[] = [
          ...(showOwoxAi ? [{ value: OWOX_AI_SELECTION, label: 'OWOX AI' }] : []),
          ...(requirement.optional
            ? [{ value: DO_NOT_GRANT_VALUE, label: 'Do not grant', separator: showOwoxAi }]
            : []),
          ...eligible.map(credential => ({
            value: credential.id,
            label: `${credential.title} · ${credential.definition.displayName}`,
          })),
          ...(canAddCredential
            ? [
                {
                  value: ADD_CREDENTIAL_VALUE,
                  label: 'Add Credential',
                  separator: showOwoxAi || requirement.optional || eligible.length > 0,
                },
              ]
            : []),
        ];
        return (
          <div key={requirement.key} className={tiles ? 'dm-card-block' : 'flex flex-col gap-3'}>
            <div className='flex flex-col gap-1'>
              <span className='flex items-baseline gap-1 text-sm font-medium'>
                <span>{presentation.label}</span>
                {requirement.optional && (
                  <span className='text-muted-foreground font-normal'>(optional)</span>
                )}
              </span>
              <span className='text-muted-foreground text-xs'>{presentation.providers}</span>
              {requirement.scopes.length > 0 && (
                <div className='text-muted-foreground mt-1 flex flex-col text-xs'>
                  <span>Scopes:</span>
                  {requirement.scopes.map(scope => (
                    <span key={scope} className='break-all'>
                      {scope}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className='flex flex-col gap-1.5'>
              <Combobox
                value={selected === null ? DO_NOT_GRANT_VALUE : (selected ?? '')}
                options={credentialOptions}
                disabled={
                  disabled ||
                  credentialsLoading ||
                  (!showOwoxAi &&
                    !requirement.optional &&
                    eligible.length === 0 &&
                    !canAddCredential)
                }
                ariaLabel={`Select ${presentation.label} Credential`}
                ariaInvalid={showSelectionError || grantUnusable || owoxAiUnusable}
                ariaDescribedBy={showOwoxAiNote ? `${noteId}-${requirement.key}` : undefined}
                placeholder={credentialsLoading ? 'Loading...' : 'Select a Credential'}
                emptyMessage='No enabled matching Credentials found'
                className='dm-card-formcontrol w-full'
                onOpenChange={isOpen => {
                  if (!isOpen) form.touch(requirement.key);
                }}
                onValueChange={value => {
                  if (value === ADD_CREDENTIAL_VALUE) {
                    if (onAddCredential) {
                      onAddCredential(requirement);
                    } else {
                      setCreatingRequirement(requirement);
                    }
                    return;
                  }
                  form.select(requirement.key, value === DO_NOT_GRANT_VALUE ? null : value);
                }}
                renderLabel={option =>
                  option.value === ADD_CREDENTIAL_VALUE ? (
                    <div className='flex min-w-0 flex-1 items-center gap-2'>
                      <div className='flex h-6 w-6 items-center justify-center'>
                        <Plus size={16} />
                      </div>
                      <span className='min-w-0 truncate'>{option.label}</span>
                    </div>
                  ) : (
                    <span className='min-w-0 flex-1 truncate'>{option.label}</span>
                  )
                }
              />
              {showOwoxAiNote && (
                <span id={`${noteId}-${requirement.key}`} className='text-muted-foreground text-xs'>
                  This deployment provides the AI models. You do not need your own key from an AI
                  provider.
                  {form.owoxAi?.billed ? " Calls use this project's credits." : ''}
                </span>
              )}
              {grantUnusable ? (
                <span className='text-destructive text-xs' role='alert'>
                  The Credential granted before can no longer be used. Choose another
                  {requirement.optional ? ' or Do not grant' : ''}.
                </span>
              ) : owoxAiUnusable ? (
                <span className='text-destructive text-xs' role='alert'>
                  OWOX AI can no longer be used. Choose a Credential
                  {requirement.optional ? ' or Do not grant' : ''}.
                </span>
              ) : (
                showSelectionError && (
                  <span className='text-destructive text-xs' role='alert'>
                    {requirement.optional
                      ? 'Choose a Credential or Do not grant.'
                      : 'Select a Credential to continue.'}
                  </span>
                )
              )}
            </div>
          </div>
        );
      })}
      {creatingRequirement && (
        <CredentialConfigSheet
          key={creatingRequirement.key}
          isOpen
          credential={null}
          definitions={definitions}
          allowedDefinitionIds={allowedDefinitionIds}
          initialDefinitionId={creatingRequirement.definitionId ?? allowedDefinitionIds[0]}
          onClose={() => {
            setCreatingRequirement(null);
          }}
          onCreated={created => {
            if (!isCredentialEligible(created, creatingRequirement)) return;
            form.addCredential(creatingRequirement.key, created);
          }}
        />
      )}
    </>
  );
}

function compatibleDefinitionIds(
  requirement: NormalizedPluginCredentialRequirement,
  definitions: readonly {
    id: string;
    supportsAi: boolean;
    ai: { recommended?: Partial<Record<'fast' | 'reasoning' | 'embedding', string>> } | null;
  }[]
): string[] {
  if (requirement.definitionId !== null) {
    return definitions
      .filter(definition => definition.id === requirement.definitionId)
      .map(definition => definition.id);
  }

  return definitions
    .filter(
      definition =>
        definition.supportsAi &&
        requirement.models.every(model =>
          Boolean(
            definition.ai?.recommended?.[
              model as keyof NonNullable<typeof definition.ai>['recommended']
            ]
          )
        )
    )
    .map(definition => definition.id);
}
