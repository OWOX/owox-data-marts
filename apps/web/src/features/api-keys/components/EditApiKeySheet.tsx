import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@owox/ui/components/sheet';
import {
  AppForm,
  Form,
  FormActions,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormLayout,
  FormMessage,
  FormSection,
} from '@owox/ui/components/form';
import { Input } from '@owox/ui/components/input';
import { Button } from '@owox/ui/components/button';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiKeysService } from '../services/api-keys.service';
import type { ProjectMemberApiKey } from '../types';

const editApiKeySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
});

type EditApiKeyFormValues = z.infer<typeof editApiKeySchema>;

interface EditApiKeySheetProps {
  apiKey: ProjectMemberApiKey | null;
  onClose: () => void;
  onUpdated: () => void;
}

export function EditApiKeySheet({ apiKey, onClose, onUpdated }: EditApiKeySheetProps) {
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<EditApiKeyFormValues>({
    resolver: zodResolver(editApiKeySchema),
    defaultValues: { name: '' },
    mode: 'onChange',
  });

  const { control, handleSubmit, reset } = form;

  useEffect(() => {
    if (apiKey) {
      reset({ name: apiKey.name });
    }
  }, [apiKey, reset]);

  const onSubmit = async (values: EditApiKeyFormValues) => {
    if (!apiKey) return;
    setSubmitting(true);
    try {
      await apiKeysService.updateKey(apiKey.apiKeyId, { name: values.name });
      toast.success('API key name updated');
      onUpdated();
    } catch {
      toast.error('Failed to update API key name');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet
      open={!!apiKey}
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit API Key</SheetTitle>
          <SheetDescription>Update the name of your API key.</SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <AppForm onSubmit={e => void handleSubmit(onSubmit)(e)}>
            <FormLayout>
              <FormSection title='Key name' name='edit-key-name'>
                <FormField
                  control={control}
                  name='name'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FormSection>
            </FormLayout>

            <FormActions>
              <Button type='button' variant='secondary' onClick={onClose}>
                Cancel
              </Button>
              <Button type='submit' disabled={submitting}>
                {submitting ? <Loader2 className='mr-2 size-4 animate-spin' /> : null}
                Save
              </Button>
            </FormActions>
          </AppForm>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
