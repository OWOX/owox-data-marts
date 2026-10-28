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

interface DatabricksFieldsProps {
  form: UseFormReturn<DataStorageFormData>;
}

export const DatabricksFields = ({ form }: DatabricksFieldsProps) => {
  if (form.watch('type') !== DataStorageType.DATABRICKS) {
    return null;
  }

  return (
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
  );
};
