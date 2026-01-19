import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DataStorageStatus, DataStorageType } from '../../../shared';
import { GoogleBigQueryFields } from './GoogleBigQueryFields';
import { AwsAthenaFields } from './AwsAthenaFields';
import { SnowflakeFields } from './SnowflakeFields';
import { RedshiftFields } from './RedshiftFields';
import { DatabricksFields } from './DatabricksFields';
import StorageTypeSnowflakeDescription from './FormDescriptions/StorageTypeSnowflakeDescription.tsx';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { DataStorageTypeModel } from '../../../shared/types/data-storage-type.model.ts';
import { type DataStorageFormData, dataStorageSchema } from '../../../shared';
import { Input } from '@owox/ui/components/input';
import {
  Form,
  AppForm,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormLayout,
  FormActions,
  FormSection,
  FormDescription,
} from '@owox/ui/components/form';
import StorageTypeBigQueryDescription from './FormDescriptions/StorageTypeBigQueryDescription.tsx';
import StorageTypeAthenaDescription from './FormDescriptions/StorageTypeAthenaDescription.tsx';
import StorageTypeRedshiftDescription from './FormDescriptions/StorageTypeRedshiftDescription.tsx';
import StorageTypeDatabricksDescription from './FormDescriptions/StorageTypeDatabricksDescription.tsx';
import { Button } from '@owox/ui/components/button';
import { createFormPayload } from '../../../../../utils/form-utils';

interface DataStorageFormProps {
  initialData?: DataStorageFormData;
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
  const form = useForm<DataStorageFormData>({
    resolver: zodResolver(dataStorageSchema),
    defaultValues: initialData,
  });

  const {
    watch,
    control,
    formState: { isDirty, isSubmitting },
  } = form;
  const selectedType = watch('type');

  React.useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const handleSubmit = async (data: DataStorageFormData) => {
    const { dirtyFields } = form.formState;
    const payload = createFormPayload(data);

    if (!dirtyFields.credentials) {
      delete (payload as Partial<DataStorageFormData>).credentials;
    }

    return onSubmit(payload);
  };

  return (
    <Form {...form}>
      <AppForm
        onSubmit={e => {
          void form.handleSubmit(handleSubmit)(e);
        }}
        noValidate
      >
        <FormLayout>
          <FormSection title='General'>
            <FormField
              control={control}
              name='title'
              render={({ field }) => (
                <FormItem>
                  <FormLabel tooltip='Name the storage to clarify its purpose'>Title</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder='Storage title' />
                  </FormControl>
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
          {selectedType === DataStorageType.GOOGLE_BIGQUERY && <GoogleBigQueryFields form={form} />}
          {selectedType === DataStorageType.AWS_ATHENA && <AwsAthenaFields form={form} />}
          {selectedType === DataStorageType.SNOWFLAKE && <SnowflakeFields form={form} />}
          {selectedType === DataStorageType.AWS_REDSHIFT && <RedshiftFields form={form} />}
          {selectedType === DataStorageType.DATABRICKS && <DatabricksFields form={form} />}
        </FormLayout>
        <FormActions>
          <Button
            variant='default'
            type='submit'
            className='w-full'
            aria-label='Save'
            disabled={!isDirty || isSubmitting}
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
