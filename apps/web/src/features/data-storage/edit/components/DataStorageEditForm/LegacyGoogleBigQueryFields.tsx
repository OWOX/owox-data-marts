import { Button } from '@owox/ui/components/button';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';
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
import { Textarea } from '@owox/ui/components/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Combobox } from '../../../../../shared/components/Combobox/combobox.tsx';
import { getServiceAccountLink } from '../../../../../utils/google-cloud-utils';
import type { DataStorageFormData } from '../../../shared';
import { DataStorageType, googleBigQueryLocationOptions } from '../../../shared';
import GoogleBigQueryServiceAccountDescription from './FormDescriptions/GoogleBigQueryServiceAccountDescription';
import LegacyGoogleBigQueryLocationDescription from './FormDescriptions/LegacyGoogleBigQueryLocationDescription.tsx';
import LegacyGoogleBigQueryProjectIdDescription from './FormDescriptions/LegacyGoogleBigQueryProjectIdDescription.tsx';

interface LegacyGoogleBigQueryFieldsProps {
  form: UseFormReturn<DataStorageFormData>;
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
  const [isEditing, setIsEditing] = useState(false);

  if (form.watch('type') !== DataStorageType.LEGACY_GOOGLE_BIGQUERY) {
    return null;
  }

  const handleEdit = () => {
    setIsEditing(true);
    form.setValue('credentials.serviceAccount', '', {
      shouldDirty: true,
    });
  };

  const handleCancel = () => {
    setIsEditing(false);
    form.resetField('credentials.serviceAccount');
  };

  const serviceAccountValue = form.watch('credentials.serviceAccount');
  const serviceAccountLink = serviceAccountValue
    ? getServiceAccountLink(serviceAccountValue)
    : null;

  return (
    <>
      {/* Connection Settings */}
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

      {/* Authentication */}
      <FormSection title='Authentication'>
        <FormField
          control={form.control}
          name='credentials.serviceAccount'
          render={({ field }) => (
            <FormItem>
              <div className='flex items-center justify-between'>
                <FormLabel tooltip='Paste a JSON key from a service account that has access to the selected storage provider'>
                  Service Account
                </FormLabel>
                {!isEditing && serviceAccountValue && (
                  <Button variant='ghost' size='sm' onClick={handleEdit} type='button'>
                    Edit
                  </Button>
                )}
                {isEditing && (
                  <Button variant='ghost' size='sm' onClick={handleCancel} type='button'>
                    Cancel
                  </Button>
                )}
              </div>
              <FormControl>
                {!isEditing && serviceAccountLink ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <ExternalAnchor href={serviceAccountLink.url}>
                        {serviceAccountLink.email}
                      </ExternalAnchor>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>View in Google Cloud Console</p>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Textarea
                    {...field}
                    className='min-h-[150px] font-mono'
                    rows={8}
                    placeholder='Paste your service account JSON here'
                  />
                )}
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
