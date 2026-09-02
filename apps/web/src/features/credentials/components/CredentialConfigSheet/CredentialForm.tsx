import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@owox/ui/components/button';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';
import {
  AppForm,
  Form,
  FormActions,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormLayout,
  FormMessage,
  FormSection,
} from '@owox/ui/components/form';
import { Input } from '@owox/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { Switch } from '@owox/ui/components/switch';
import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ContextPicker } from '../../../contexts/components/ContextPicker/ContextPicker';
import { OwnersSection } from '../../../../shared/components/OwnersSection/OwnersSection';
import type { UserProjectionDto } from '../../../../shared/types/api';
import { focusFirstInvalidField } from '../../../../utils/form-utils';
import { extractApiError } from '../../../../app/api/extract-api-error.util';
import type {
  CreateCredentialRequest,
  Credential,
  CredentialDefinition,
  UpdateCredentialRequest,
} from '../../types';
import { safeCredentialDocumentationUrl } from '../../credential-documentation-url';

const GITHUB_DEFINITION_VALUE = '__github-credential-definition__';
const GITHUB_REPOSITORY_PATTERN = /^@[^/]+\/[^/]+$/;
const aiMappingModeSchema = z.enum(['recommended', 'override', 'off']);

const credentialFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(255, 'Name must be 255 characters or less'),
  definitionId: z.string().min(1, 'Provider is required'),
  githubRepository: z.string().max(512, 'Repository is too long'),
  secret: z.string().max(32_768, 'Secret is too long'),
  enabled: z.boolean(),
  availableForUse: z.boolean(),
  availableForMaintenance: z.boolean(),
  ownerIds: z.array(z.string()),
  contextIds: z.array(z.string()),
  aiModelMappings: z.object({
    fast: z.string(),
    reasoning: z.string(),
    embedding: z.string(),
  }),
  aiModelMappingModes: z.object({
    fast: aiMappingModeSchema.optional(),
    reasoning: aiMappingModeSchema.optional(),
    embedding: aiMappingModeSchema.optional(),
  }),
});

type CredentialFormValues = z.infer<typeof credentialFormSchema>;
type AiMappingKey = keyof CredentialFormValues['aiModelMappings'];
type AiMappingMode = Exclude<CredentialFormValues['aiModelMappingModes'][AiMappingKey], undefined>;

export interface CredentialFormProps {
  credential: Credential | null;
  definitions: CredentialDefinition[];
  initialDefinitionId?: string;
  allowedDefinitionIds?: readonly string[];
  isSaving: boolean;
  onSubmit: (input: CreateCredentialRequest | UpdateCredentialRequest) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onRequestReplaceSecret?: (credential: Credential) => void;
  onRequestAddGithubDefinition?: (repository: string) => Promise<CredentialDefinition>;
  canManageAccess?: boolean;
}

export function CredentialForm({
  credential,
  definitions,
  initialDefinitionId,
  allowedDefinitionIds,
  isSaving,
  onSubmit,
  onCancel,
  onDirtyChange,
  onRequestReplaceSecret,
  onRequestAddGithubDefinition,
  canManageAccess = false,
}: CredentialFormProps) {
  const isEditMode = credential !== null;
  const [addedDefinition, setAddedDefinition] = useState<CredentialDefinition | null>(null);
  const [githubInstallationUrl, setGithubInstallationUrl] = useState<string | null>(null);
  const definitionOptions = useMemo(() => {
    const options = [...definitions];
    if (addedDefinition && !options.some(definition => definition.id === addedDefinition.id)) {
      options.push(addedDefinition);
    }
    if (isEditMode || !allowedDefinitionIds) return options;
    const allowed = new Set(allowedDefinitionIds);
    return options.filter(definition => allowed.has(definition.id));
  }, [addedDefinition, allowedDefinitionIds, definitions, isEditMode]);
  const defaultDefinitionId = credential
    ? credential.definition.id
    : initialDefinitionId && definitionOptions.some(({ id }) => id === initialDefinitionId)
      ? initialDefinitionId
      : (definitionOptions[0]?.id ?? '');
  const defaultDefinition =
    definitionOptions.find(({ id }) => id === defaultDefinitionId) ?? credential?.definition;

  const form = useForm<CredentialFormValues>({
    resolver: zodResolver(credentialFormSchema),
    defaultValues: {
      title: credential?.title ?? '',
      definitionId: defaultDefinitionId,
      githubRepository: '',
      secret: '',
      enabled: credential?.enabled ?? true,
      availableForUse: credential?.availableForUse ?? true,
      availableForMaintenance: credential?.availableForMaintenance ?? false,
      ownerIds: credential?.ownerUsers.map(owner => owner.userId) ?? [],
      contextIds: credential?.contexts.map(context => context.id) ?? [],
      aiModelMappings: initialAiMappings(credential, defaultDefinition),
      aiModelMappingModes: initialAiMappingModes(credential, defaultDefinition),
    },
    mode: 'onTouched',
  });

  const [ownerUsers, setOwnerUsers] = useState<UserProjectionDto[]>(credential?.ownerUsers ?? []);
  const definitionId = form.watch('definitionId');
  const isGithubDefinition = definitionId === GITHUB_DEFINITION_VALUE;
  const selectedDefinition =
    definitionOptions.find(definition => definition.id === definitionId) ?? credential?.definition;
  const documentationUrl = safeCredentialDocumentationUrl(selectedDefinition?.documentationUrl);
  const aiMappingModes = form.watch('aiModelMappingModes');

  useEffect(() => {
    onDirtyChange?.(form.formState.isDirty);
  }, [form.formState.isDirty, onDirtyChange]);

  const selectDefinition = (definition: CredentialDefinition) => {
    setGithubInstallationUrl(null);
    form.setValue('definitionId', definition.id, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
    form.setValue('aiModelMappings', recommendedMappings(definition), { shouldDirty: true });
    form.setValue('aiModelMappingModes', recommendedModes(definition.ai?.recommended), {
      shouldDirty: true,
    });
  };

  const handleDefinitionChange = (value: string) => {
    setGithubInstallationUrl(null);
    if (value === GITHUB_DEFINITION_VALUE) {
      form.setValue('definitionId', value, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      form.setValue('aiModelMappings', emptyAiMappings(), { shouldDirty: true });
      form.setValue('aiModelMappingModes', {}, { shouldDirty: true });
      return;
    }
    const definition = definitionOptions.find(candidate => candidate.id === value);
    if (definition) selectDefinition(definition);
  };

  const loadGithubDefinition = async () => {
    const repository = form.getValues('githubRepository').trim();
    if (!GITHUB_REPOSITORY_PATTERN.test(repository)) {
      form.setError('githubRepository', {
        type: 'validate',
        message: 'Enter a repository as @owner/repository',
      });
      return;
    }

    setGithubInstallationUrl(null);
    form.clearErrors('githubRepository');
    try {
      const definition = await onRequestAddGithubDefinition?.(repository);
      if (!definition) return;
      setAddedDefinition(definition);
      selectDefinition(definition);
    } catch (caught) {
      const apiError = extractApiError(caught);
      const errorDetails = apiError.errorDetails as { installationUrl?: string } | undefined;
      setGithubInstallationUrl(
        apiError.code === 'GITHUB_REPO_NOT_ACCESSIBLE'
          ? safeCredentialDocumentationUrl(errorDetails?.installationUrl)
          : null
      );
      form.setError('githubRepository', {
        type: 'server',
        message: apiError.message ?? 'Could not load the GitHub definition',
      });
    }
  };

  const handleSubmit = async (values: CredentialFormValues) => {
    if (!isEditMode && values.definitionId === GITHUB_DEFINITION_VALUE) {
      form.setError(
        'githubRepository',
        { type: 'required', message: 'Load the GitHub definition before saving' },
        { shouldFocus: true }
      );
      return;
    }

    if (!isEditMode && values.secret.length === 0) {
      form.setError('secret', { type: 'required', message: 'Secret is required' });
      return;
    }

    const { mappings, modes } = serializeAiMappings(values);
    if (credential) {
      const dirty = form.formState.dirtyFields;
      const input: UpdateCredentialRequest = {};
      if (dirty.title) input.title = values.title;
      if (dirty.enabled) input.enabled = values.enabled;
      if (dirty.availableForUse) input.availableForUse = values.availableForUse;
      if (dirty.availableForMaintenance) {
        input.availableForMaintenance = values.availableForMaintenance;
      }
      if (dirty.ownerIds) input.ownerIds = values.ownerIds;
      if (dirty.contextIds) input.contextIds = values.contextIds;
      if (dirty.aiModelMappings || dirty.aiModelMappingModes) {
        input.aiModelMappings = Object.keys(mappings).length > 0 ? mappings : null;
        input.aiModelMappingModes = Object.keys(modes).length > 0 ? modes : null;
      }
      await onSubmit(input);
      return;
    }

    await onSubmit({
      title: values.title,
      definitionId: values.definitionId,
      secret: { value: values.secret },
      availableForUse: values.availableForUse,
      availableForMaintenance: values.availableForMaintenance,
      aiModelMappings: Object.keys(mappings).length > 0 ? mappings : undefined,
      aiModelMappingModes: Object.keys(modes).length > 0 ? modes : undefined,
    });
  };

  return (
    <Form {...form}>
      <AppForm
        data-testid='credentialConfigForm'
        noValidate
        onSubmit={event => {
          void form.handleSubmit(handleSubmit, focusFirstInvalidField)(event);
        }}
      >
        <FormLayout>
          <FormSection title='General' name='credential-general'>
            <FormField
              control={form.control}
              name='title'
              render={({ field }) => (
                <FormItem>
                  <FormLabel tooltip='Name this Credential so project members can identify it.'>
                    Name
                  </FormLabel>
                  <FormControl>
                    <Input {...field} maxLength={255} placeholder='Enter Credential name' />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='definitionId'
              render={({ fieldState }) => (
                <FormItem>
                  <FormLabel tooltip='The definition controls how this Credential authorizes provider requests.'>
                    Provider
                  </FormLabel>
                  {credential ? (
                    <Input value={credential.definition.displayName} disabled />
                  ) : (
                    <Select value={definitionId} onValueChange={handleDefinitionChange}>
                      <FormControl>
                        <SelectTrigger className='w-full' aria-invalid={fieldState.invalid}>
                          <SelectValue placeholder='Select a provider' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {definitionOptions.map(definition => (
                          <SelectItem key={definition.id} value={definition.id}>
                            {definition.displayName}
                          </SelectItem>
                        ))}
                        {onRequestAddGithubDefinition && (
                          <SelectItem value={GITHUB_DEFINITION_VALUE}>GitHub definition</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {isGithubDefinition && (
              <FormField
                control={form.control}
                name='githubRepository'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GitHub repository</FormLabel>
                    <div className='flex items-start gap-2'>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder='@owner/repository'
                          maxLength={512}
                          onChange={event => {
                            field.onChange(event);
                            setGithubInstallationUrl(null);
                          }}
                          onKeyDown={event => {
                            if (event.key !== 'Enter') return;
                            event.preventDefault();
                            void loadGithubDefinition();
                          }}
                        />
                      </FormControl>
                      <Button
                        type='button'
                        variant='outline'
                        disabled={isSaving}
                        onClick={() => void loadGithubDefinition()}
                      >
                        {isSaving ? 'Checking…' : 'Load definition'}
                      </Button>
                    </div>
                    <FormDescription>
                      OWOX loads the latest eligible GitHub Release. Private repositories require
                      configured GitHub access.
                    </FormDescription>
                    <FormMessage />
                    {githubInstallationUrl && (
                      <FormDescription>
                        <ExternalAnchor href={githubInstallationUrl}>
                          Give OWOX Data Marts access to this repository
                        </ExternalAnchor>
                        , then load the definition again.
                      </FormDescription>
                    )}
                  </FormItem>
                )}
              />
            )}

            {credential && (
              <FormField
                control={form.control}
                name='enabled'
                render={({ field }) => (
                  <FormItem>
                    <div className='flex items-center justify-between gap-4'>
                      <FormLabel tooltip='Disabled Credentials cannot be used by consumers.'>
                        Enabled
                      </FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </div>
                  </FormItem>
                )}
              />
            )}
          </FormSection>

          {(credential ?? selectedDefinition) && (
            <FormSection title='Authentication' name='credential-authentication'>
              {credential ? (
                <FormItem>
                  <div className='flex items-center justify-between gap-4'>
                    <div className='flex flex-col gap-1'>
                      <FormLabel>Secret</FormLabel>
                      <span className='text-muted-foreground text-sm'>Configured</span>
                      {documentationUrl && (
                        <ExternalAnchor href={documentationUrl} className='w-fit text-sm'>
                          How to get this key
                        </ExternalAnchor>
                      )}
                    </div>
                    {onRequestReplaceSecret && (
                      <Button
                        type='button'
                        variant='outline'
                        onClick={() => {
                          onRequestReplaceSecret(credential);
                        }}
                      >
                        Replace secret
                      </Button>
                    )}
                  </div>
                </FormItem>
              ) : (
                <FormField
                  control={form.control}
                  name='secret'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{selectedDefinition?.secretLabel ?? 'Secret'}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type='password'
                          autoComplete='new-password'
                          maxLength={32_768}
                        />
                      </FormControl>
                      {documentationUrl && (
                        <FormDescription>
                          <ExternalAnchor href={documentationUrl}>
                            How to get this key
                          </ExternalAnchor>
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </FormSection>
          )}

          {selectedDefinition?.supportsAi && (
            <FormSection
              title='AI models'
              name='credential-ai-models'
              tooltip='Logical plugin handles resolve to provider model IDs. Recommended values are applied automatically; choose Override model ID to enter a custom value.'
            >
              <div className='flex flex-col gap-3' data-testid='credentialAiMappings'>
                {aiMappingKeys(selectedDefinition).map(key => (
                  <AiMappingField
                    key={key}
                    mappingKey={key}
                    definition={selectedDefinition}
                    mode={aiMappingModes[key]}
                    form={form}
                  />
                ))}
              </div>
            </FormSection>
          )}

          {credential && canManageAccess && (
            <FormSection title='Ownership' defaultOpen={false} name='credential-ownership'>
              <FormItem>
                <FormLabel tooltip='Project members responsible for this Credential.'>
                  Owners
                </FormLabel>
                <OwnersSection
                  ownerUsers={ownerUsers}
                  onSave={users => {
                    setOwnerUsers(users);
                    form.setValue(
                      'ownerIds',
                      users.map(user => user.userId),
                      { shouldDirty: true }
                    );
                  }}
                />
              </FormItem>
            </FormSection>
          )}

          {credential && canManageAccess && (
            <FormSection title='Contexts' defaultOpen={false} name='credential-contexts'>
              <FormItem>
                <FormLabel tooltip='Business domain contexts assigned to this Credential.'>
                  Assigned
                </FormLabel>
                <ContextPicker
                  selectedContextIds={form.watch('contextIds')}
                  onChange={ids => {
                    form.setValue('contextIds', ids, { shouldDirty: true });
                  }}
                  idPrefix={`credential-${credential.id}-context`}
                />
              </FormItem>
            </FormSection>
          )}

          {(!credential || canManageAccess) && (
            <FormSection title='Sharing' defaultOpen={false} name='credential-sharing'>
              <FormField
                control={form.control}
                name='availableForUse'
                render={({ field }) => (
                  <FormItem>
                    <div className='flex items-center justify-between gap-4'>
                      <FormLabel tooltip='Project members with access can bind this Credential to consumers.'>
                        Shared for use
                      </FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </div>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='availableForMaintenance'
                render={({ field }) => (
                  <FormItem>
                    <div className='flex items-center justify-between gap-4'>
                      <FormLabel tooltip='Project members with maintenance access can edit this Credential.'>
                        Shared for maintenance
                      </FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </div>
                  </FormItem>
                )}
              />
            </FormSection>
          )}

          {credential && (
            <FormSection title='Details' defaultOpen={false} name='credential-details'>
              <FormItem>
                <FormLabel>Created at</FormLabel>
                <span className='text-muted-foreground text-sm'>
                  {formatDate(credential.createdAt)}
                </span>
              </FormItem>
              <FormItem>
                <FormLabel>Updated at</FormLabel>
                <span className='text-muted-foreground text-sm'>
                  {formatDate(credential.modifiedAt)}
                </span>
              </FormItem>
              {credential.usedBy.length > 0 && <CredentialUsedByList credential={credential} />}
            </FormSection>
          )}
        </FormLayout>

        <FormActions>
          <Button
            type='submit'
            className='w-full'
            disabled={
              isSaving || form.formState.isSubmitting || (isEditMode && !form.formState.isDirty)
            }
          >
            {(isSaving || form.formState.isSubmitting) && (
              <Loader2 className='mr-2 size-4 animate-spin' />
            )}
            Save
          </Button>
          <Button type='button' variant='outline' className='w-full' onClick={onCancel}>
            Cancel
          </Button>
        </FormActions>
      </AppForm>
    </Form>
  );
}

function AiMappingField({
  mappingKey,
  definition,
  mode,
  form,
}: {
  mappingKey: AiMappingKey;
  definition: CredentialDefinition;
  mode: AiMappingMode | undefined;
  form: ReturnType<typeof useForm<CredentialFormValues>>;
}) {
  return (
    <div className='flex flex-col gap-2 rounded-md border bg-white px-4 py-3 dark:border-transparent dark:bg-white/4'>
      <FormField
        control={form.control}
        name={`aiModelMappingModes.${mappingKey}`}
        render={({ field }) => (
          <FormItem variant='light'>
            <FormLabel>{aiMappingLabel(mappingKey)}</FormLabel>
            <Select
              value={field.value ?? 'off'}
              onValueChange={value => {
                const nextMode = value as AiMappingMode;
                field.onChange(nextMode);
                if (nextMode === 'off') {
                  form.setValue(`aiModelMappings.${mappingKey}`, '', { shouldDirty: true });
                } else if (nextMode === 'recommended') {
                  form.setValue(
                    `aiModelMappings.${mappingKey}`,
                    definition.ai?.recommended?.[mappingKey] ?? '',
                    { shouldDirty: true }
                  );
                }
              }}
            >
              <FormControl>
                <SelectTrigger data-testid={`credentialAiMode-${mappingKey}`} className='w-full'>
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {definition.ai?.recommended?.[mappingKey] && (
                  <SelectItem value='recommended'>Use recommended model</SelectItem>
                )}
                <SelectItem value='override'>Override model ID</SelectItem>
                {mappingKey === 'embedding' && <SelectItem value='off'>Not configured</SelectItem>}
              </SelectContent>
            </Select>
          </FormItem>
        )}
      />

      {mode === 'override' && (
        <FormField
          control={form.control}
          name={`aiModelMappings.${mappingKey}`}
          render={({ field }) => (
            <FormItem variant='light'>
              <FormLabel>Model ID</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  list={`credential-ai-${mappingKey}-models`}
                  placeholder={definition.ai?.recommended?.[mappingKey] ?? 'Provider model ID'}
                />
              </FormControl>
              <datalist id={`credential-ai-${mappingKey}-models`}>
                {aiModelsForKey(definition, mappingKey).map(model => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </datalist>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </div>
  );
}

export function CredentialUsedByList({ credential }: { credential: Credential }) {
  return (
    <div className='bg-muted/50 rounded-md border p-3 text-sm'>
      <div className='mb-1 font-medium'>Used by</div>
      {credential.usedBy.map(consumer => (
        <div
          key={`${consumer.consumerType}:${consumer.consumerId}:${consumer.requirementKey}`}
          className='text-muted-foreground'
        >
          {consumer.consumerType} · {consumer.requirementKey} · last used{' '}
          {formatDate(consumer.lastUsedAt)}
        </div>
      ))}
    </div>
  );
}

function serializeAiMappings(values: CredentialFormValues): {
  mappings: Record<string, string>;
  modes: Record<string, 'recommended' | 'override'>;
} {
  const mappings: Record<string, string> = {};
  const modes: Record<string, 'recommended' | 'override'> = {};
  for (const key of Object.keys(values.aiModelMappings) as AiMappingKey[]) {
    const value = values.aiModelMappings[key].trim();
    const mode = values.aiModelMappingModes[key];
    if (value && mode && mode !== 'off') {
      mappings[key] = value;
      modes[key] = mode;
    }
  }
  return { mappings, modes };
}

function emptyAiMappings(): CredentialFormValues['aiModelMappings'] {
  return { fast: '', reasoning: '', embedding: '' };
}

function initialAiMappings(
  credential: Credential | null,
  definition: CredentialDefinition | undefined
): CredentialFormValues['aiModelMappings'] {
  const mappings = credential?.aiModelMappings ?? definition?.ai?.recommended ?? {};
  return {
    fast: mappings.fast ?? '',
    reasoning: mappings.reasoning ?? '',
    embedding: mappings.embedding ?? '',
  };
}

function initialAiMappingModes(
  credential: Credential | null,
  definition: CredentialDefinition | undefined
): CredentialFormValues['aiModelMappingModes'] {
  return credential?.aiModelMappingModes ?? recommendedModes(definition?.ai?.recommended);
}

function recommendedMappings(
  definition: CredentialDefinition
): CredentialFormValues['aiModelMappings'] {
  return {
    fast: definition.ai?.recommended?.fast ?? '',
    reasoning: definition.ai?.recommended?.reasoning ?? '',
    embedding: definition.ai?.recommended?.embedding ?? '',
  };
}

function recommendedModes(
  recommended: Partial<Record<AiMappingKey, string>> | undefined
): CredentialFormValues['aiModelMappingModes'] {
  return Object.fromEntries(
    Object.keys(recommended ?? {}).map(key => [key, 'recommended'] as const)
  );
}

function aiMappingKeys(definition: CredentialDefinition): AiMappingKey[] {
  if (!definition.ai) return [];
  const keys: AiMappingKey[] = ['fast', 'reasoning'];
  if (definition.ai.recommended?.embedding || (definition.ai.models?.embedding.length ?? 0) > 0) {
    keys.push('embedding');
  }
  return keys;
}

function aiModelsForKey(
  definition: CredentialDefinition,
  key: AiMappingKey
): { id: string; name: string }[] {
  if (!definition.ai?.models) return [];
  return key === 'embedding' ? definition.ai.models.embedding : definition.ai.models.language;
}

function aiMappingLabel(key: AiMappingKey): string {
  if (key === 'fast') return 'Fast model';
  if (key === 'reasoning') return 'Reasoning model';
  return 'Embedding model';
}

function formatDate(value: string | null): string {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value)
  );
}
