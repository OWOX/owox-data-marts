import { type UseFormReturn } from 'react-hook-form';
import { type DataDestinationFormData } from '../../../shared';
import { SENSITIVE_KEYS } from '../../../shared/constants';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@owox/ui/components/form';
import { SecureJsonInput } from '../../../../../shared';
import GoogleSheetsServiceAccountDescription from './FormDescriptions/GoogleSheetsServiceAccountDescription';

interface GoogleSheetsFieldsProps {
  form: UseFormReturn<DataDestinationFormData>;
}

export function GoogleSheetsFields({ form }: GoogleSheetsFieldsProps) {
  return (
    <FormField
      control={form.control}
      name='credentials.serviceAccount'
      render={({ field }) => (
        <FormItem className='w-full max-w-full'>
          <FormLabel tooltip='Paste a JSON key from a service account that has access to the selected destination type'>
            Service Account JSON
          </FormLabel>
          <FormControl>
            <div className='w-full max-w-full overflow-hidden'>
              <SecureJsonInput
                value={field.value}
                onChange={field.onChange}
                keysToMask={SENSITIVE_KEYS}
                className='w-full max-w-full overflow-x-auto break-words whitespace-pre-wrap'
              />
            </div>
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
