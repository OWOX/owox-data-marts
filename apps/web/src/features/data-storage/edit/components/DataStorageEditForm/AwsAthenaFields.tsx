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
import AthenaRegionDescription from './FormDescriptions/AthenaRegionDescription.tsx';
import AthenaDatabaseNameDescription from './FormDescriptions/AthenaDatabaseNameDescription.tsx';
import AthenaOutputBucketDescription from './FormDescriptions/AthenaOutputBucketDescription.tsx';
import AthenaAccessKeyIdDescription from './FormDescriptions/AthenaAccessKeyIdDescription.tsx';
import AthenaSecretAccessKeyDescription from './FormDescriptions/AthenaSecretAccessKeyDescription.tsx';
import { useEffect, useState } from 'react';

interface AwsAthenaFieldsProps {
  form: UseFormReturn<DataStorageFormData>;
}

export const AwsAthenaFields = ({ form }: AwsAthenaFieldsProps) => {
  const [maskedSecretValue, setMaskedSecretValue] = useState<string>('');

  useEffect(() => {
    const accessKeyId = form.getValues('credentials.accessKeyId');

    // Якщо accessKeyId заповнений під час ініціалізації і secretAccessKey теж є
    if (accessKeyId) {
      const maskedValue = '_'.repeat(accessKeyId.length);
      console.log('maskedValue', maskedValue);
      setMaskedSecretValue(maskedValue);
      form.setValue('credentials.secretAccessKey', maskedValue, { shouldDirty: false });
    }
  }, []); // Порожній масив залежностей - викликається тільки один раз

  if (form.watch('type') !== DataStorageType.AWS_ATHENA) {
    return null;
  }
  return (
    <>
      {/* Connection Settings */}
      <FormSection title='Connection Settings'>
        <FormField
          control={form.control}
          name='config.region'
          render={({ field }) => (
            <FormItem>
              <FormLabel tooltip='Enter the AWS region where your Athena service is active'>
                Region
              </FormLabel>
              <FormControl>
                <Input {...field} placeholder='Enter a region' />
              </FormControl>
              <FormDescription>
                <AthenaRegionDescription />
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='config.databaseName'
          render={({ field }) => (
            <FormItem>
              <FormLabel tooltip='Enter the name of your Athena database where your tables are stored'>
                Database Name
              </FormLabel>
              <FormControl>
                <Input {...field} placeholder='Enter a database name' />
              </FormControl>
              <FormDescription>
                <AthenaDatabaseNameDescription />
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='config.outputBucket'
          render={({ field }) => (
            <FormItem>
              <FormLabel tooltip='Specify the S3 bucket where Athena query results will be stored'>
                Output Bucket
              </FormLabel>
              <FormControl>
                <Input {...field} placeholder='Enter an output bucket' />
              </FormControl>
              <FormDescription>
                <AthenaOutputBucketDescription />
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </FormSection>

      {/* Authentication */}
      <FormSection title='Authentication'>
        <FormField
          control={form.control}
          name='credentials.accessKeyId'
          render={({ field }) => (
            <FormItem>
              <FormLabel tooltip='Your AWS Access Key ID used for authentication'>
                Access Key ID
              </FormLabel>
              <FormControl>
                <Input {...field} placeholder='Enter an access key id' />
              </FormControl>
              <FormDescription>
                <AthenaAccessKeyIdDescription />
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='credentials.secretAccessKey'
          render={({ field }) => (
            <FormItem>
              <FormLabel tooltip='Your AWS Secret Access Key used for authentication'>
                Secret Access Key
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type='password'
                  placeholder={maskedSecretValue || 'Enter a secret access key'}
                />
              </FormControl>
              <FormDescription>
                <AthenaSecretAccessKeyDescription />
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </FormSection>
    </>
  );
};
