import { useEffect, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Input } from '@owox/ui/components/input';
import { Tabs, TabsList, TabsTrigger } from '@owox/ui/components/tabs';
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormSection,
  FormDescription,
} from '@owox/ui/components/form';
import { DataStorageType, RedshiftConnectionType } from '../../../shared';
import type { DataStorageFormData } from '../../../shared/types/data-storage.schema.ts';
import RedshiftRegionDescription from './FormDescriptions/RedshiftRegionDescription.tsx';
import RedshiftWorkgroupDescription from './FormDescriptions/RedshiftWorkgroupDescription.tsx';
import RedshiftClusterDescription from './FormDescriptions/RedshiftClusterDescription.tsx';
import RedshiftDatabaseDescription from './FormDescriptions/RedshiftDatabaseDescription.tsx';
import RedshiftAccessKeyIdDescription from './FormDescriptions/RedshiftAccessKeyIdDescription.tsx';
import RedshiftSecretAccessKeyDescription from './FormDescriptions/RedshiftSecretAccessKeyDescription.tsx';

interface RedshiftFieldsProps {
  form: UseFormReturn<DataStorageFormData>;
}

export const RedshiftFields = ({ form }: RedshiftFieldsProps) => {
  const [maskedSecretValue, setMaskedSecretValue] = useState<string>('');

  // Set default connectionType if not set
  useEffect(() => {
    const currentType = form.getValues('config.connectionType') as
      | RedshiftConnectionType
      | undefined;
    const formType = form.watch('type');
    if (currentType === undefined && formType === DataStorageType.AWS_REDSHIFT) {
      form.setValue('config.connectionType', RedshiftConnectionType.SERVERLESS, {
        shouldDirty: false,
      });
    }
  }, [form]);

  useEffect(() => {
    const accessKeyId = form.getValues('credentials.accessKeyId');

    if (accessKeyId) {
      const maskedValue = '_'.repeat(accessKeyId.length);
      setMaskedSecretValue(maskedValue);
      form.setValue('credentials.secretAccessKey', maskedValue, { shouldDirty: false });
    }
  }, [form]);

  if (form.watch('type') !== DataStorageType.AWS_REDSHIFT) {
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
              <FormLabel tooltip='Enter the AWS region where your Redshift service is active'>
                Region
              </FormLabel>
              <FormControl>
                <Input {...field} placeholder='Enter a region' />
              </FormControl>
              <FormDescription>
                <RedshiftRegionDescription />
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='config.connectionType'
          render={({ field }) => {
            const connectionType =
              (field.value as RedshiftConnectionType | undefined) ??
              RedshiftConnectionType.SERVERLESS;
            return (
              <FormItem>
                <div className='flex items-center justify-between'>
                  <FormLabel
                    tooltip={
                      connectionType === RedshiftConnectionType.SERVERLESS
                        ? 'Workgroup name for Redshift Serverless'
                        : 'Cluster identifier for provisioned Redshift cluster'
                    }
                  >
                    {connectionType === RedshiftConnectionType.SERVERLESS
                      ? 'Workgroup Name'
                      : 'Cluster Identifier'}
                  </FormLabel>
                  <Tabs value={connectionType} onValueChange={field.onChange}>
                    <TabsList>
                      <TabsTrigger value={RedshiftConnectionType.SERVERLESS}>
                        Serverless
                      </TabsTrigger>
                      <TabsTrigger value={RedshiftConnectionType.PROVISIONED}>
                        Provisioned
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <FormControl>
                  {connectionType === RedshiftConnectionType.SERVERLESS ? (
                    <Input
                      {...form.register('config.workgroupName')}
                      placeholder='Enter workgroup name'
                    />
                  ) : (
                    <Input
                      {...form.register('config.clusterIdentifier')}
                      placeholder='Enter cluster identifier'
                    />
                  )}
                </FormControl>
                <FormDescription>
                  {connectionType === RedshiftConnectionType.SERVERLESS ? (
                    <RedshiftWorkgroupDescription />
                  ) : (
                    <RedshiftClusterDescription />
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        <FormField
          control={form.control}
          name='config.database'
          render={({ field }) => (
            <FormItem>
              <FormLabel tooltip='The database name to connect to'>Database</FormLabel>
              <FormControl>
                <Input {...field} placeholder='Enter database name' />
              </FormControl>
              <FormDescription>
                <RedshiftDatabaseDescription />
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
                <RedshiftAccessKeyIdDescription />
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
                <RedshiftSecretAccessKeyDescription />
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </FormSection>
    </>
  );
};
