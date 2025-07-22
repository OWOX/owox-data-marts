import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DataDestinationType } from '../../../shared';
import { GoogleSheetsFields } from './GoogleSheetsFields';
import { LookerStudioFields } from './LookerStudioFields';
import { DestinationTypeField } from './DestinationTypeField';
import {
  Form,
  AppForm,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormLayout,
  FormActions,
} from '@owox/ui/components/form';
import { type DataDestinationFormData, dataDestinationSchema } from '../../../shared';
import { Input } from '@owox/ui/components/input';
import { Button } from '@owox/ui/components/button';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';

interface DataDestinationFormProps {
  initialData?: DataDestinationFormData;
  onSubmit: (data: DataDestinationFormData) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

export function DataDestinationForm({
  initialData,
  onSubmit,
  onCancel,
  onDirtyChange,
}: DataDestinationFormProps) {
  const form = useForm<DataDestinationFormData>({
    resolver: zodResolver(dataDestinationSchema),
    defaultValues: initialData ?? {
      title: '',
      type: DataDestinationType.GOOGLE_SHEETS,
      credentials: {
        serviceAccount: '',
      },
    },
    mode: 'onTouched',
  });

  // Get the current destination type
  const destinationType = form.watch('type');

  useEffect(() => {
    onDirtyChange?.(form.formState.isDirty);
  }, [form.formState.isDirty, onDirtyChange]);

  return (
    <Form {...form}>
      <AppForm
        onSubmit={e => {
          void form.handleSubmit(onSubmit)(e);
        }}
      >
        <FormLayout>
          <FormField
            control={form.control}
            name='title'
            render={({ field }) => (
              <FormItem>
                <FormLabel tooltip='Name the destination to clarify its purpose'>Title</FormLabel>
                <FormControl>
                  <Input placeholder='Enter title' {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <DestinationTypeField form={form} initialData={initialData} />

          {destinationType === DataDestinationType.GOOGLE_SHEETS && (
            <GoogleSheetsFields form={form} />
          )}

          {destinationType === DataDestinationType.LOOKER_STUDIO && (
            <LookerStudioFields form={form} initialData={initialData} />
          )}
        </FormLayout>
        <FormActions>
          <Button
            variant='default'
            type='submit'
            className='w-full'
            aria-label='Save'
            disabled={!form.formState.isDirty || form.formState.isSubmitting}
          >
            {form.formState.isSubmitting && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            Save
          </Button>
          <Button
            variant='outline'
            type='button'
            onClick={onCancel}
            className='w-full'
            aria-label='Cancel'
          >
            Cancel
          </Button>
        </FormActions>
      </AppForm>
    </Form>
  );
}
