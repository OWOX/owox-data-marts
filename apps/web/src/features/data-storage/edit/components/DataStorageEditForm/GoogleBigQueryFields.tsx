import { Input } from '@owox/ui/components/input';
import { DataStorageType, SENSITIVE_KEYS } from '../../../shared';
import type { DataStorageFormData } from '../../../shared';
import { googleBigQueryLocationOptions } from '../../../shared';
import { Combobox } from '../../../../../shared/components/Combobox/combobox.tsx';
import { SecureJsonInput } from '../../../../../shared';
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
import GoogleBigQueryServiceAccountDescription from './FormDescriptions/GoogleBigQueryServiceAccountDescription';
import GoogleBigQueryProjectIdDescription from './FormDescriptions/GoogleBigQueryProjectIdDescription.tsx';
import GoogleBigQueryLocationDescription from './FormDescriptions/GoogleBigQueryLocationDescription.tsx';

interface GoogleBigQueryFieldsProps {
  form: UseFormReturn<DataStorageFormData>;
}

export const GoogleBigQueryFields = ({ form }: GoogleBigQueryFieldsProps) => {
  if (form.watch('type') !== DataStorageType.GOOGLE_BIGQUERY) {
    return null;
  }

  return (
    <>
      {/* Connection Settings */}
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
                <Input {...field} />
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

      {/* Authentication */}
      <FormSection title='Authentication'>
        <FormField
          control={form.control}
          name='credentials.serviceAccount'
          render={({ field }) => (
            <FormItem>
              <FormLabel tooltip='Paste a JSON key from a service account that has access to the selected storage provider'>
                Service Account JSON
              </FormLabel>
              <FormControl>
                <SecureJsonInput
                  value={field.value}
                  onChange={field.onChange}
                  keysToMask={SENSITIVE_KEYS}
                />
              </FormControl>
              <FormDescription>
                <GoogleBigQueryServiceAccountDescription />
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </FormSection>
    </>
  );
};
