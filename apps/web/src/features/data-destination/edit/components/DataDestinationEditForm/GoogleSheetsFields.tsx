import { Button } from '@owox/ui/components/button';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@owox/ui/components/form';
import { Textarea } from '@owox/ui/components/textarea';
import { useState } from 'react';
import { type UseFormReturn } from 'react-hook-form';
import { extractServiceAccountEmail } from '../../../../data-marts/reports/shared/utils/service-account.utils';
import { type DataDestinationFormData } from '../../../shared';
import GoogleSheetsServiceAccountDescription from './FormDescriptions/GoogleSheetsServiceAccountDescription';

interface GoogleSheetsFieldsProps {
  form: UseFormReturn<DataDestinationFormData>;
}

export function GoogleSheetsFields({ form }: GoogleSheetsFieldsProps) {
  const [isEditing, setIsEditing] = useState(false);

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
  const serviceAccountEmail = serviceAccountValue
    ? extractServiceAccountEmail(serviceAccountValue)
    : undefined;

  return (
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
            {!isEditing ? (
              <span className='font-mono'>{serviceAccountEmail ?? '—'}</span>
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
            <GoogleSheetsServiceAccountDescription />
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
