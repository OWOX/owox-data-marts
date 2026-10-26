import { useEffect } from 'react';
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

interface RedshiftFieldsProps {
  form: UseFormReturn<DataStorageFormData>;
}

export const RedshiftFields = ({ form }: RedshiftFieldsProps) => {
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

  if (form.watch('type') !== DataStorageType.AWS_REDSHIFT) {
    return null;
  }

  return (
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

      {(() => {
        const connectionType =
          (form.watch('config.connectionType') as RedshiftConnectionType | undefined) ??
          RedshiftConnectionType.SERVERLESS;
        const tabs = (
          <Tabs
            value={connectionType}
            onValueChange={value => {
              form.setValue('config.connectionType', value as RedshiftConnectionType, {
                shouldDirty: true,
              });
            }}
          >
            <TabsList>
              <TabsTrigger value={RedshiftConnectionType.SERVERLESS}>Serverless</TabsTrigger>
              <TabsTrigger value={RedshiftConnectionType.PROVISIONED}>Provisioned</TabsTrigger>
            </TabsList>
          </Tabs>
        );
        return connectionType === RedshiftConnectionType.SERVERLESS ? (
          <FormField
            control={form.control}
            name='config.workgroupName'
            render={({ field }) => (
              <FormItem>
                <div className='flex items-center justify-between'>
                  <FormLabel tooltip='Workgroup name for Redshift Serverless'>
                    Workgroup Name
                  </FormLabel>
                  {tabs}
                </div>
                <FormControl>
                  <Input {...field} placeholder='Enter workgroup name' />
                </FormControl>
                <FormDescription>
                  <RedshiftWorkgroupDescription />
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : (
          <FormField
            control={form.control}
            name='config.clusterIdentifier'
            render={({ field }) => (
              <FormItem>
                <div className='flex items-center justify-between'>
                  <FormLabel tooltip='Cluster identifier for provisioned Redshift cluster'>
                    Cluster Identifier
                  </FormLabel>
                  {tabs}
                </div>
                <FormControl>
                  <Input {...field} placeholder='Enter cluster identifier' />
                </FormControl>
                <FormDescription>
                  <RedshiftClusterDescription />
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        );
      })()}

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
  );
};
