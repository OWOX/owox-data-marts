import { Input } from '@owox/ui/components/input';
import { DataStorageType } from '../../../shared';
import type { DataStorageFormData } from '../../../shared';
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
import GoogleBigQueryServiceAccountDescription from './FormDescriptions/GoogleBigQueryServiceAccountDescription';
import GoogleBigQueryProjectIdDescription from './FormDescriptions/GoogleBigQueryProjectIdDescription.tsx';
import GoogleBigQueryLocationDescription from './FormDescriptions/GoogleBigQueryLocationDescription.tsx';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { Button } from '@owox/ui/components/button';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';
import { Textarea } from '@owox/ui/components/textarea';
import { useState } from 'react';
import { getServiceAccountLink } from '../../../../../utils/google-cloud-utils';

interface GoogleBigQueryFieldsProps {
  form: UseFormReturn<DataStorageFormData>;
}

export const GoogleBigQueryFields = ({ form }: GoogleBigQueryFieldsProps) => {
  const [isEditing, setIsEditing] = useState(false);

  if (form.watch('type') !== DataStorageType.GOOGLE_BIGQUERY) {
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
                  value={field.value ?? ''}
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
