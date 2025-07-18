import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DataDestinationType } from '../../../shared';
import { GoogleSheetsFields } from './GoogleSheetsFields';
import { DestinationTypeField } from './DestinationTypeField';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormLayout,
  FormFooter,
} from '@owox/ui/components/form';
import { type DataDestinationFormData, dataDestinationSchema } from '../../../shared';
import { Input } from '@owox/ui/components/input';

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

  React.useEffect(() => {
    onDirtyChange?.(form.formState.isDirty);
  }, [form.formState.isDirty, onDirtyChange]);

  return (
    <Form {...form}>
      <FormLayout
        noValidate
        footer={
          <FormFooter
            isSubmitting={form.formState.isSubmitting}
            isDirty={form.formState.isDirty}
            onSave={() => void form.handleSubmit(onSubmit)()}
            onCancel={onCancel}
            saveLabel='Save'
          />
        }
      >
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
        <GoogleSheetsFields form={form} />
      </FormLayout>
    </Form>
  );
}
