import { Input } from '@owox/ui/components/input';
import type { GoogleBigQueryFormData } from '../../../shared';
import { googleBigQueryLocationOptions } from '../../../shared';
import { Combobox } from '../../../../../shared/components/Combobox/combobox.tsx';
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
import GoogleBigQueryProjectIdDescription from './FormDescriptions/GoogleBigQueryProjectIdDescription.tsx';
import GoogleBigQueryLocationDescription from './FormDescriptions/GoogleBigQueryLocationDescription.tsx';

interface GoogleBigQueryFieldsProps {
  form: UseFormReturn<GoogleBigQueryFormData>;
}

export const GoogleBigQueryFields = ({ form }: GoogleBigQueryFieldsProps) => {
  return (
    <FormSection title='Connection Settings'>
      <FormField
        control={form.control}
        name='config.projectId'
        render={({ field }) => (
          <FormItem>
            <FormLabel tooltip='Enter the ID of your Google Cloud project where BigQuery usage will be billed'>
              Project ID
            </FormLabel>
            <FormControl>
              <Input {...field} placeholder='Enter a Project Id' />
            </FormControl>
            <FormDescription>
              <GoogleBigQueryProjectIdDescription />
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name='config.location'
        render={({ field }) => (
          <FormItem>
            <FormLabel tooltip='Choose the same region where your BigQuery data is stored to ensure queries work correctly'>
              Location
            </FormLabel>
            <FormControl>
              <Combobox
                options={googleBigQueryLocationOptions}
                value={field.value}
                onValueChange={field.onChange}
                placeholder='Select a location'
                emptyMessage='No locations found'
                className='w-full'
              />
            </FormControl>
            <FormDescription>
              <GoogleBigQueryLocationDescription />
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </FormSection>
  );
};
