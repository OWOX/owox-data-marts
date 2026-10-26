import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormSection,
} from '@owox/ui/components/form';
import { Input } from '@owox/ui/components/input';
import type { UseFormReturn } from 'react-hook-form';
import { Combobox } from '../../../../../shared/components/Combobox/combobox.tsx';
import type { LegacyGoogleBigQueryFormData } from '../../../shared';
import { googleBigQueryLocationOptions } from '../../../shared';
import LegacyGoogleBigQueryLocationDescription from './FormDescriptions/LegacyGoogleBigQueryLocationDescription.tsx';
import LegacyGoogleBigQueryProjectIdDescription from './FormDescriptions/LegacyGoogleBigQueryProjectIdDescription.tsx';

interface LegacyGoogleBigQueryFieldsProps {
  form: UseFormReturn<LegacyGoogleBigQueryFormData>;
}

const LEGACY_AUTODETECT_LOCATION = 'AUTODETECT';

const legacyGoogleBigQueryLocationOptions = [
  {
    value: LEGACY_AUTODETECT_LOCATION,
    label: 'Auto-detect location',
    group: 'General',
  },
  ...googleBigQueryLocationOptions,
];

export const LegacyGoogleBigQueryFields = ({ form }: LegacyGoogleBigQueryFieldsProps) => {
  return (
    <FormSection title='Connection Settings'>
      <FormField
        control={form.control}
        name='config.projectId'
        render={({ field }) => (
          <FormItem>
            <FormLabel tooltip='The ID of your Google Cloud project associated with this storage'>
              Project ID
            </FormLabel>
            <FormControl>
              <Input {...field} disabled />
            </FormControl>
            <FormDescription>
              <LegacyGoogleBigQueryProjectIdDescription />
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
            <FormLabel tooltip='Choose the same region where your BigQuery data is stored to ensure queries work correctly or use auto-detect option'>
              Location
            </FormLabel>
            <FormControl>
              <Combobox
                options={legacyGoogleBigQueryLocationOptions}
                value={field.value}
                onValueChange={field.onChange}
                placeholder='Select a location'
                emptyMessage='No locations found'
                className='w-full'
              />
            </FormControl>
            <FormDescription>
              <LegacyGoogleBigQueryLocationDescription />
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </FormSection>
  );
};
