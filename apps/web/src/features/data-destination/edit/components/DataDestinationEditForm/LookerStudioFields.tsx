import { type UseFormReturn } from 'react-hook-form';
import { type DataDestinationFormData } from '../../../shared';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@owox/ui/components/form';
import { Input } from '@owox/ui/components/input';

interface LookerStudioFieldsProps {
  form: UseFormReturn<DataDestinationFormData>;
  initialData?: DataDestinationFormData;
}

export function LookerStudioFields({ form, initialData }: LookerStudioFieldsProps) {
  // Determine if we're in edit mode (initialData exists) or create mode
  const isEditMode = !!initialData;

  return (
    <>
      <FormField
        control={form.control}
        name='credentials.urlHost'
        render={({ field }) => (
          <FormItem className='w-full'>
            <FormLabel tooltip='Enter the URL host that the Looker Studio connector will use'>
              URL Host
            </FormLabel>
            <FormControl>
              <Input placeholder='https://example.com' {...field} />
            </FormControl>
            <FormDescription>
              The URL host that the Looker Studio connector will use to access your data.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {isEditMode && <>Secret</>}
    </>
  );
}
