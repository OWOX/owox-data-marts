import { zodResolver } from '@hookform/resolvers/zod';
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { CredentialIdentity } from '../../../../../shared/types/credential-identity';
import { CopyCredentialContext } from '../../model/context/copy-credential-context';
import { createFormPayload } from '../../../../../utils/form-utils';
import { COPY_SOURCE_CREDENTIAL_PLACEHOLDER } from '../../../../../shared/utils/credential-identity-utils';
import {
  type DataStorageFormData,
  type GoogleBigQueryFormData,
  type LegacyGoogleBigQueryFormData,
  DataStorageHealthIndicator,
  dataStorageSchema,
  DataStorageStatus,
  DataStorageType,
} from '../../../shared';
import type { UseFormReturn } from 'react-hook-form';
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

interface DataStorageFormProps {
  initialData?: DataStorageFormData & { id?: string };
  onSubmit: (
    data: DataStorageFormData,
    source?: { id: string; title: string } | null
  ) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

export function DataStorageForm({
  initialData,
  onSubmit,
  onCancel,
  onDirtyChange,
}: DataStorageFormProps) {
  const form = useForm<DataStorageFormData>({
    resolver: zodResolver(dataStorageSchema),
    defaultValues: initialData,
  });

  const [selectedSource, setSelectedSource] = useState<{
    id: string;
    title: string;
    identity: CredentialIdentity | null;
  } | null>(null);

  const handleSourceSelect = (id: string, title: string, identity: CredentialIdentity | null) => {
    setSelectedSource({ id, title, identity });
    // For Google types, set a placeholder credentialId so Zod validation passes.
    // Non-Google types don't have credentialId in their schemas, so we skip this.
    // Credentials are copied server-side via sourceStorageId; the placeholder is
    // stripped from the payload in handleSubmit.
    const currentType = form.getValues('type');
    if (
      currentType === DataStorageType.GOOGLE_BIGQUERY ||
      currentType === DataStorageType.LEGACY_GOOGLE_BIGQUERY
    ) {
      form.setValue('credentials.credentialId', COPY_SOURCE_CREDENTIAL_PLACEHOLDER, {
        shouldDirty: false,
        shouldValidate: true,
      });
    }
  };

  const handleSourceClear = () => {
    setSelectedSource(null);
    // Restore credential field to its original value from initialData
    form.resetField('credentials.credentialId');
  };

  const {
    watch,
    control,
    formState: { isDirty, isSubmitting },
  } = form;
  const selectedType = watch('type');
  const storageId = initialData?.id;

  useEffect(() => {
    onDirtyChange?.(isDirty || selectedSource !== null);
  }, [isDirty, selectedSource, onDirtyChange]);

  const copyCredentialCtx = useMemo(
    () => ({
      entityId: storageId,
      onSourceSelect: handleSourceSelect,
      selectedSource,
      onSourceClear: handleSourceClear,
    }),
    [storageId, selectedSource, handleSourceSelect, handleSourceClear]
  );

  const handleSubmit = async (data: DataStorageFormData) => {
    const { dirtyFields } = form.formState;
    const payload = createFormPayload(data);

    // Strip credentials when copying from another source (server handles it via sourceStorageId)
    // or when no credential fields were touched by the user.
    if (!dirtyFields.credentials || selectedSource) {
      delete (payload as Partial<DataStorageFormData>).credentials;
    }

    return onSubmit(payload, selectedSource);
  };

  const isLegacyGoogleBigQuery = selectedType === DataStorageType.LEGACY_GOOGLE_BIGQUERY;

  return (
    <Form {...form}>
      <AppForm
        onSubmit={e => {
          void form.handleSubmit(handleSubmit)(e);
        }}
        noValidate
      >
        <FormLayout>
          <FormSection title='General' defaultOpen={!isLegacyGoogleBigQuery}>
            {storageId && (
              <FormItem>
                <DataStorageHealthIndicator storageId={storageId} />
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
          <CopyCredentialContext.Provider value={copyCredentialCtx}>
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
          </CopyCredentialContext.Provider>
        </FormLayout>
        <FormActions>
          <Button
            variant='default'
            type='submit'
            className='w-full'
            aria-label='Save'
            disabled={(!isDirty && !selectedSource) || isSubmitting}
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
    </Form>
  );
}
