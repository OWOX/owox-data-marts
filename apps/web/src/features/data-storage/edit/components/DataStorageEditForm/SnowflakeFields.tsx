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
import SnowflakeAccountDescription from './FormDescriptions/SnowflakeAccountDescription.tsx';
import SnowflakeWarehouseDescription from './FormDescriptions/SnowflakeWarehouseDescription.tsx';

interface SnowflakeFieldsProps {
  form: UseFormReturn<DataStorageFormData>;
}

export const SnowflakeFields = ({ form }: SnowflakeFieldsProps) => {
  if (form.watch('type') !== DataStorageType.SNOWFLAKE) {
    return null;
  }

  return (
    <FormSection title='Connection Settings'>
      <FormField
        control={form.control}
        name='config.account'
        render={({ field }) => (
          <FormItem>
            <FormLabel tooltip='Enter your Snowflake account identifier'>Account</FormLabel>
            <FormControl>
              <Input {...field} placeholder='e.g., xy12345.us-east-1' />
            </FormControl>
            <FormDescription>
              <SnowflakeAccountDescription />
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name='config.warehouse'
        render={({ field }) => (
          <FormItem>
            <FormLabel tooltip='Specify the Snowflake warehouse to use for query execution'>
              Warehouse
            </FormLabel>
            <FormControl>
              <Input {...field} placeholder='Enter warehouse name' />
            </FormControl>
            <FormDescription>
              <SnowflakeWarehouseDescription />
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </FormSection>
  );
};
