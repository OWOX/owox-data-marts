import { Button } from '@owox/ui/components/button';
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
import { Switch } from '@owox/ui/components/switch';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { OwnersSection } from '../../../../../shared/components/OwnersSection/OwnersSection';
import { ContextPicker } from '../../../../../features/contexts/components/ContextPicker/ContextPicker';
import { AddContextSheet } from '../../../../../features/contexts/components/AddContextSheet/AddContextSheet';
import { useInlineContextCreate } from '../../../../../features/contexts/hooks/useInlineContextCreate';
import type { UserProjectionDto } from '../../../../../shared/types/api';
import { useOwnerState } from '../../../../../shared/hooks/useOwnerState';
import { useUser } from '../../../../idp/hooks/useAuthState';
import { useIsAdmin } from '../../../../idp/hooks/useRole';
import { UserReference } from '../../../../../shared/components/UserReference/UserReference';
import { createDataStorageFormResolver } from '../../model/data-storage-form-resolver';
import {
  applyServerFieldErrors,
  createFormPayload,
  focusFirstInvalidField,
} from '../../../../../utils/form-utils';
import { apiErrorMessage, extractApiFieldErrors, wasErrorToastShown } from '../../../../../app/api';
import toast from 'react-hot-toast';
import { trackEvent } from '../../../../../utils/data-layer';
import { toDataStorageFormField } from '../../model/data-storage-server-errors';
import {
  type DataStorageFormData,
  type GoogleBigQueryFormData,
  type LegacyGoogleBigQueryFormData,
  DataStorageHealthIndicator,
  DataStorageStatus,
  DataStorageType,
} from '../../../shared';
import type { UseFormReturn } from 'react-hook-form';
import type { DataStorage } from '../../../shared/model/types/data-storage.ts';
import { DataStorageTypeModel } from '../../../shared/types/data-storage-type.model.ts';
import { AwsAthenaFields } from './AwsAthenaFields';
import { DatabricksFields } from './DatabricksFields';
import LegacyGoogleBigQueryTitleDescription from './FormDescriptions/LegacyGoogleBigQueryTitleDescription.tsx';
import StorageTypeAthenaDescription from './FormDescriptions/StorageTypeAthenaDescription.tsx';
import StorageTypeBigQueryDescription from './FormDescriptions/StorageTypeBigQueryDescription.tsx';
import StorageTypeDatabricksDescription from './FormDescriptions/StorageTypeDatabricksDescription.tsx';
import StorageTypeLegacyBigQueryDescription from './FormDescriptions/StorageTypeLegacyBigQueryDescription.tsx';
import StorageTypeRedshiftDescription from './FormDescriptions/StorageTypeRedshiftDescription.tsx';
import StorageTypeSnowflakeDescription from './FormDescriptions/StorageTypeSnowflakeDescription.tsx';
import { GoogleBigQueryFields } from './GoogleBigQueryFields';
import { LegacyGoogleBigQueryFields } from './LegacyGoogleBigQueryFields';
import { RedshiftFields } from './RedshiftFields';
import { SnowflakeFields } from './SnowflakeFields';
import { StorageCredentialField } from './StorageCredentialField';

interface DataStorageFormProps {
  initialData?: DataStorage;
  onSubmit: (data: DataStorageFormData) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

export function DataStorageForm({
  initialData,
  onSubmit,
  onCancel,
  onDirtyChange,
}: DataStorageFormProps) {
  // Fixed at mount, like the form's default values it is compared with.
  const [initialCredential] = useState(() => initialData?.reusableCredential ?? null);
  const initialCredentialId = initialCredential?.access === 'visible' ? initialCredential.id : null;
  // A Storage still on its own key counts as bound: it keeps that key until the member picks one.
  const hasBinding = initialCredential !== null;
  const resolver = useMemo(() => createDataStorageFormResolver(hasBinding), [hasBinding]);
  const form = useForm<DataStorageFormData>({
    resolver,
    defaultValues: { ...initialData, reusableCredentialId: initialCredentialId ?? '' },
  });
  const credentialSourceRef = useRef<'existing' | 'created' | 'auto'>('existing');
  const handleCredentialChange = useCallback(
    (id: string, source: 'existing' | 'created' | 'auto') => {
      credentialSourceRef.current = source;
      // A preselected Credential alone does not make the form dirty.
      form.setValue('reusableCredentialId', id, {
        shouldDirty: source !== 'auto',
        shouldValidate: true,
      });
    },
    [form]
  );

  const currentUser = useUser();
  const initialOwnerUsers =
    (initialData?.ownerUsers as UserProjectionDto[] | undefined) ??
    (currentUser
      ? [
          {
            userId: currentUser.id,
            fullName: currentUser.fullName ?? null,
            email: currentUser.email ?? null,
            avatar: currentUser.avatar ?? null,
          },
        ]
      : []);
  const {
    ownerUsers,
    ownersDirty,
    handleOwnersChange,
    pendingOwnerIdsRef,
    consumePendingOwnerIds,
  } = useOwnerState(initialOwnerUsers);

  // Fixed at mount too: a Data Mart's embedded copy, without contexts, replaces it while closing.
  const [sharingInitial] = useState(() => ({
    availableForUse: initialData?.availableForUse ?? true,
    availableForMaintenance: initialData?.availableForMaintenance ?? true,
  }));
  const [sharingState, setSharingState] = useState(sharingInitial);

  const sharingDirty =
    sharingState.availableForUse !== sharingInitial.availableForUse ||
    sharingState.availableForMaintenance !== sharingInitial.availableForMaintenance;

  const [initialContextIds] = useState(() => (initialData?.contexts ?? []).map(c => c.id));
  const [contextIds, setContextIds] = useState<string[]>(initialContextIds);
  const contextsDirty =
    contextIds.length !== initialContextIds.length ||
    contextIds.some(id => !initialContextIds.includes(id));

  const isAdmin = useIsAdmin();
  const inlineContext = useInlineContextCreate({
    enabled: isAdmin,
    onCreated: created => {
      setContextIds(prev => (prev.includes(created.id) ? prev : [...prev, created.id]));
    },
  });

  const {
    watch,
    control,
    formState: { isDirty, isSubmitting },
  } = form;
  const selectedType = watch('type');
  const storageId = initialData?.id;

  useEffect(() => {
    onDirtyChange?.(isDirty || ownersDirty || sharingDirty || contextsDirty);
  }, [isDirty, ownersDirty, sharingDirty, contextsDirty, onDirtyChange]);

  const handleSubmit = async (data: DataStorageFormData, event?: { target?: unknown }) => {
    const payload = createFormPayload(data);
    const credentialChanged =
      Boolean(data.reusableCredentialId) && data.reusableCredentialId !== initialCredentialId;
    if (!credentialChanged) {
      delete (payload as Partial<DataStorageFormData>).reusableCredentialId;
    }

    // Read, not consumed: a rejected save keeps the owner change for the retry.
    const ownerIds = pendingOwnerIdsRef.current;
    if (ownerIds !== null) {
      (payload as Record<string, unknown>).ownerIds = ownerIds;
    }

    if (sharingDirty) {
      (payload as Record<string, unknown>).availableForUse = sharingState.availableForUse;
      (payload as Record<string, unknown>).availableForMaintenance =
        sharingState.availableForMaintenance;
    }

    if (contextsDirty) {
      (payload as Record<string, unknown>).contextIds = contextIds;
    }

    try {
      await onSubmit(payload);
      consumePendingOwnerIds();
      if (credentialChanged) {
        trackEvent({
          event: 'storage_credential_selected',
          category: 'DataStorage',
          action: credentialSourceRef.current,
          label: data.type,
          context: null,
          value: null,
        });
      }
    } catch (error) {
      // When the rejection names the values it refused, mark those inputs the same way
      // client-side validation does, so the user sees which field to fix instead of decoding
      // the toast.
      const highlighted = applyServerFieldErrors(
        form.setError,
        extractApiFieldErrors(error),
        field => toDataStorageFormField(data.type, field)
      );
      if (highlighted) {
        focusFirstInvalidField(undefined, event);
      }
      // Reported once whatever was marked: the marked input may not be on screen (a collapsed
      // section). The API interceptor toasts 400/403/404/5xx; a network failure,
      // any other status or a throw after the save is reported here.
      if (!wasErrorToastShown(error)) {
        console.error(error);
        toast.error(apiErrorMessage(error, 'Failed to save the Storage'));
      }
    }
  };

  const isLegacyGoogleBigQuery = selectedType === DataStorageType.LEGACY_GOOGLE_BIGQUERY;

  return (
    <Form {...form}>
      <AppForm
        data-testid='storageEditForm'
        onSubmit={e => {
          void form.handleSubmit(handleSubmit, focusFirstInvalidField)(e);
        }}
        noValidate
      >
        <FormLayout>
          <FormSection
            title='General'
            defaultOpen={!isLegacyGoogleBigQuery}
            fields={['title', 'type']}
          >
            {storageId && (
              <FormItem>
                <DataStorageHealthIndicator storageId={storageId} credential={initialCredential} />
              </FormItem>
            )}
            <FormField
              control={control}
              name='title'
              render={({ field }) => (
                <FormItem>
                  <FormLabel tooltip='Name the storage to clarify its purpose'>Title</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder='Storage title'
                      disabled={isLegacyGoogleBigQuery}
                    />
                  </FormControl>
                  {isLegacyGoogleBigQuery && (
                    <FormDescription>
                      <LegacyGoogleBigQueryTitleDescription />
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name='type'
              render={({ field }) => (
                <FormItem>
                  <FormLabel tooltip='The selected source will be used to process data in your Data Marts'>
                    Storage Type
                  </FormLabel>
                  <FormControl>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={!!initialData}
                    >
                      <SelectTrigger className='w-full'>
                        <SelectValue placeholder='Select a storage type' />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {DataStorageTypeModel.getAllTypes().map(
                            ({ type, displayName, icon: Icon, status }) => (
                              <SelectItem
                                key={type}
                                value={type}
                                disabled={status === DataStorageStatus.COMING_SOON}
                              >
                                <div className='flex items-center gap-2'>
                                  <Icon size={20} />
                                  {displayName}
                                </div>
                              </SelectItem>
                            )
                          )}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormDescription>
                    {selectedType === DataStorageType.GOOGLE_BIGQUERY && (
                      <StorageTypeBigQueryDescription />
                    )}
                    {selectedType === DataStorageType.LEGACY_GOOGLE_BIGQUERY && (
                      <StorageTypeLegacyBigQueryDescription />
                    )}
                    {selectedType === DataStorageType.AWS_ATHENA && (
                      <StorageTypeAthenaDescription />
                    )}
                    {selectedType === DataStorageType.SNOWFLAKE && (
                      <StorageTypeSnowflakeDescription />
                    )}
                    {selectedType === DataStorageType.AWS_REDSHIFT && (
                      <StorageTypeRedshiftDescription />
                    )}
                    {selectedType === DataStorageType.DATABRICKS && (
                      <StorageTypeDatabricksDescription />
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>
          {selectedType === DataStorageType.GOOGLE_BIGQUERY && (
            <GoogleBigQueryFields form={form as UseFormReturn<GoogleBigQueryFormData>} />
          )}
          {selectedType === DataStorageType.LEGACY_GOOGLE_BIGQUERY && (
            <LegacyGoogleBigQueryFields
              form={form as UseFormReturn<LegacyGoogleBigQueryFormData>}
            />
          )}
          {selectedType === DataStorageType.AWS_ATHENA && <AwsAthenaFields form={form} />}
          {selectedType === DataStorageType.SNOWFLAKE && <SnowflakeFields form={form} />}
          {selectedType === DataStorageType.AWS_REDSHIFT && <RedshiftFields form={form} />}
          {selectedType === DataStorageType.DATABRICKS && <DatabricksFields form={form} />}
          <FormSection title='Authentication' fields={['reusableCredentialId']}>
            <FormField
              control={control}
              name='reusableCredentialId'
              render={({ field }) => (
                <FormItem>
                  <FormLabel tooltip='Choose the Credential this Storage connects with'>
                    Credential
                  </FormLabel>
                  <FormControl>
                    <StorageCredentialField
                      storageType={selectedType}
                      isNew={!hasBinding}
                      value={field.value || null}
                      summary={initialCredential}
                      onChange={handleCredentialChange}
                    />
                  </FormControl>
                  {initialCredential?.access === 'pending' && !field.value && (
                    <FormDescription>
                      Uses its own key until you select a Credential
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>

          <FormSection title='Ownership' defaultOpen={false} name='storage-ownership'>
            <FormItem>
              <FormLabel tooltip='Team members responsible for this storage'>Owners</FormLabel>
              <OwnersSection ownerUsers={ownerUsers} onSave={handleOwnersChange} />
              <FormDescription>
                <Accordion variant='common' type='single' collapsible>
                  <AccordionItem value='storage-owners-help'>
                    <AccordionTrigger>What is a Storage Owner?</AccordionTrigger>
                    <AccordionContent>
                      <p>
                        Storage Owner is direct ownership of this Storage. When the owner&apos;s
                        project role is Data Owner or Project Admin, they may view, edit, delete,
                        and configure Sharing for this Storage — regardless of Sharing settings.
                        Assigning Owner to a Business User stores the assignment but grants no
                        maintenance permissions until the role changes.
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </FormDescription>
            </FormItem>
          </FormSection>

          {storageId && (
            <FormSection title='Contexts' defaultOpen={false} name='storage-contexts'>
              <FormItem>
                <FormLabel tooltip='Business domain contexts assigned to this storage'>
                  Assigned
                </FormLabel>
                <ContextPicker
                  selectedContextIds={contextIds}
                  onChange={setContextIds}
                  idPrefix='storage-ctx'
                  {...inlineContext.pickerProps}
                />
                <FormDescription>
                  <Accordion variant='common' type='single' collapsible>
                    <AccordionItem value='storage-contexts-help'>
                      <AccordionTrigger>What are Contexts?</AccordionTrigger>
                      <AccordionContent>
                        <p>
                          Contexts are business domains (e.g. Marketing, Finance, Sales) used to
                          group Storages, Destinations and Data Marts. They also control access: a
                          member whose role scope is limited to specific contexts will only see
                          resources assigned to those contexts. Assign one or more contexts to make
                          this Storage discoverable to the right people.
                        </p>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </FormDescription>
              </FormItem>
            </FormSection>
          )}

          {initialData?.id && (
            <FormSection title='Sharing' defaultOpen={false} name='storage-availability'>
              <FormItem>
                <div className='flex items-center justify-between gap-4'>
                  <FormLabel>Shared for use</FormLabel>
                  <Switch
                    checked={sharingState.availableForUse}
                    onCheckedChange={v => {
                      setSharingState(prev => ({ ...prev, availableForUse: v }));
                    }}
                  />
                </div>
                <p className='text-muted-foreground text-sm'>
                  Members with the Data Owner role can use this storage when creating Data Marts
                </p>
                <FormDescription>
                  <Accordion variant='common' type='single' collapsible>
                    <AccordionItem value='sharing-use-help'>
                      <AccordionTrigger>
                        What does &quot;Shared for use&quot; mean?
                      </AccordionTrigger>
                      <AccordionContent>
                        <p>
                          When enabled, members with the Data Owner role who are not owners of this
                          storage can select it when creating new Data Marts. Without this, only
                          storage owners and admins can use it.
                        </p>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </FormDescription>
              </FormItem>
              <FormItem>
                <div className='flex items-center justify-between gap-4'>
                  <FormLabel>Shared for maintenance</FormLabel>
                  <Switch
                    checked={sharingState.availableForMaintenance}
                    onCheckedChange={v => {
                      setSharingState(prev => ({ ...prev, availableForMaintenance: v }));
                    }}
                  />
                </div>
                <p className='text-muted-foreground text-sm'>
                  Project members with access can edit and delete this storage
                </p>
                <FormDescription>
                  <Accordion variant='common' type='single' collapsible>
                    <AccordionItem value='sharing-maintenance-help'>
                      <AccordionTrigger>
                        What does &quot;Shared for maintenance&quot; mean?
                      </AccordionTrigger>
                      <AccordionContent>
                        <p>
                          When enabled, project members can edit this storage&apos;s configuration
                          and delete it. Without this, only owners and admins can perform these
                          actions.
                        </p>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </FormDescription>
              </FormItem>
            </FormSection>
          )}

          {initialData?.createdAt && (
            <FormSection title='Details' defaultOpen={false} name='storage-details'>
              <FormItem>
                <FormLabel>Created By</FormLabel>
                <div className='text-sm'>
                  {initialData.createdByUser ? (
                    <UserReference userProjection={initialData.createdByUser} variant='full' />
                  ) : (
                    <span className='text-muted-foreground'>Unknown</span>
                  )}
                </div>
              </FormItem>
              <FormItem>
                <FormLabel>Created At</FormLabel>
                <div className='text-muted-foreground text-sm'>
                  {new Date(initialData.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </div>
              </FormItem>
            </FormSection>
          )}
        </FormLayout>
        <FormActions>
          <Button
            variant='default'
            type='submit'
            className='w-full'
            aria-label='Save'
            disabled={(!isDirty && !ownersDirty && !sharingDirty && !contextsDirty) || isSubmitting}
          >
            Save
          </Button>
          <Button
            variant='outline'
            type='button'
            onClick={onCancel}
            className='w-full'
            aria-label='Cancel'
          >
            Cancel
          </Button>
        </FormActions>
      </AppForm>
      {/*
       * Sheet-in-sheet: nested Radix Dialogs stack via portals, so the outer
       * Storage sheet stays mounted beneath and its unsaved form state is
       * preserved while the admin creates a new context. The hook bumps
       * the picker refresh token and closes the sheet; we just push the
       * new id into `contextIds`.
       */}
      <AddContextSheet {...inlineContext.sheetProps} />
    </Form>
  );
}
