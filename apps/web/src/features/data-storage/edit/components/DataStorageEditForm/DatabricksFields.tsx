import { useEffect, useState } from 'react';
import { Input } from '@owox/ui/components/input';
import { DataStorageType } from '../../../shared';
import type { DataStorageFormData } from '../../../shared/types/data-storage.schema.ts';
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormSection,
  FormDescription,
} from '@owox/ui/components/form';
import type { UseFormReturn } from 'react-hook-form';
import DatabricksHostDescription from './FormDescriptions/DatabricksHostDescription.tsx';
import DatabricksHttpPathDescription from './FormDescriptions/DatabricksHttpPathDescription.tsx';
import DatabricksTokenDescription from './FormDescriptions/DatabricksTokenDescription.tsx';
import { AuthenticationSectionHeader } from '../../../../../shared/components/AuthenticationSectionHeader';
import { CopyStorageCredentialsButton } from '../CopyStorageCredentialsButton';
import { useCopyCredentialContext } from '../../model/context/useCopyCredentialContext';

interface DatabricksFieldsProps {
  form: UseFormReturn<DataStorageFormData>;
}

export const DatabricksFields = ({ form }: DatabricksFieldsProps) => {
  const {
    entityId: storageId,
    onSourceSelect: onSourceStorageSelect,
    selectedSource,
    onSourceClear,
  } = useCopyCredentialContext();
  const [maskedTokenValue, setMaskedTokenValue] = useState<string>('');

  useEffect(() => {
    const host = form.getValues('config.host');

    if (host.length > 0) {
      const maskedToken = '_'.repeat(12);
      setMaskedTokenValue(maskedToken);
      form.setValue('credentials.token', maskedToken, { shouldDirty: false });
    }
  }, [form]);

  if (form.watch('type') !== DataStorageType.DATABRICKS) {
    return null;
  }

  return (
    <>
      {/* Connection Settings */}
      <FormSection title='Connection Settings'>
        <FormField
          control={form.control}
          name='config.host'
          render={({ field }) => (
            <FormItem>
              <FormLabel tooltip='Enter your Databricks workspace URL'>Host</FormLabel>
              <FormControl>
                <Input {...field} placeholder='e.g., adb-123456.7.azuredatabricks.net' />
              </FormControl>
              <FormDescription>
                <DatabricksHostDescription />
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='config.httpPath'
          render={({ field }) => (
            <FormItem>
              <FormLabel tooltip='Specify the SQL warehouse HTTP path'>HTTP Path</FormLabel>
              <FormControl>
                <Input {...field} placeholder='e.g., /sql/1.0/warehouses/abc123def456' />
              </FormControl>
              <FormDescription>
                <DatabricksHttpPathDescription />
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </FormSection>

      {/* Authentication */}
      <section>
        <AuthenticationSectionHeader
          itemType='storage'
          copyButton={
            <CopyStorageCredentialsButton
              storageType={DataStorageType.DATABRICKS}
              currentStorageId={storageId}
              onSelect={onSourceStorageSelect}
            />
          }
          selectedSource={selectedSource}
          onSourceClear={onSourceClear}
        />
        {!selectedSource && (
          <div className='flex flex-col gap-2'>
            <FormField
              control={form.control}
              name='credentials.token'
              render={({ field }) => (
                <FormItem>
                  <FormLabel tooltip='Your Databricks Personal Access Token'>
                    Personal Access Token
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type='password'
                      placeholder={maskedTokenValue || 'Enter your token'}
                    />
                  </FormControl>
                  <FormDescription>
                    <DatabricksTokenDescription />
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}
      </section>
    </>
  );
};
