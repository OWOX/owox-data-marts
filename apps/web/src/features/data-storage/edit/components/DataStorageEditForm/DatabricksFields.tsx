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
import DatabricksCatalogDescription from './FormDescriptions/DatabricksCatalogDescription.tsx';
import DatabricksSchemaDescription from './FormDescriptions/DatabricksSchemaDescription.tsx';

interface DatabricksFieldsProps {
  form: UseFormReturn<DataStorageFormData>;
}

export const DatabricksFields = ({ form }: DatabricksFieldsProps) => {
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
        <FormField
          control={form.control}
          name='config.catalog'
          render={({ field }) => (
            <FormItem>
              <FormLabel tooltip='Optional Unity Catalog name'>Catalog (Optional)</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} placeholder='Enter catalog name' />
              </FormControl>
              <FormDescription>
                <DatabricksCatalogDescription />
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='config.schema'
          render={({ field }) => (
            <FormItem>
              <FormLabel tooltip='Optional schema name'>Schema (Optional)</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} placeholder='Enter schema name' />
              </FormControl>
              <FormDescription>
                <DatabricksSchemaDescription />
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
          name='credentials.token'
          render={({ field }) => (
            <FormItem>
              <FormLabel tooltip='Your Databricks Personal Access Token'>
                Personal Access Token
              </FormLabel>
              <FormControl>
                <Input {...field} type='password' placeholder='Enter your token' />
              </FormControl>
              <FormDescription>
                <DatabricksTokenDescription />
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </FormSection>
    </>
  );
};
