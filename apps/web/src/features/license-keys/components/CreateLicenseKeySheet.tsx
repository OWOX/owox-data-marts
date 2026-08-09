import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@owox/ui/components/sheet';
import {
  AppForm,
  Form,
  FormActions,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormLayout,
  FormMessage,
  FormSection,
} from '@owox/ui/components/form';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { Input } from '@owox/ui/components/input';
import { Button } from '@owox/ui/components/button';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { licenseKeysService } from '../services/license-keys.service';
import type { CreateLicenseKeyResponse } from '../types';

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch {
    return false;
  }
}

const createLicenseKeySchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name must be 255 characters or less'),
  origin: z
    .string()
    .min(1, 'Public origin is required')
    .max(255, 'Public origin must be 255 characters or less')
    .refine(isHttpUrl, {
      message: 'Enter a full http or https address, for example https://data-marts.example.com',
    }),
});

type CreateLicenseKeyFormValues = z.infer<typeof createLicenseKeySchema>;

const DEFAULT_VALUES: CreateLicenseKeyFormValues = { name: '', origin: '' };

interface CreateLicenseKeySheetProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (result: CreateLicenseKeyResponse) => void;
}

export function CreateLicenseKeySheet({ isOpen, onClose, onCreated }: CreateLicenseKeySheetProps) {
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<CreateLicenseKeyFormValues>({
    resolver: zodResolver(createLicenseKeySchema),
    defaultValues: DEFAULT_VALUES,
    mode: 'onSubmit',
  });

  const { control, handleSubmit, reset } = form;

  const onSubmit = async (values: CreateLicenseKeyFormValues) => {
    setSubmitting(true);
    try {
      const result = await licenseKeysService.createKey(values);
      reset(DEFAULT_VALUES);
      onCreated(result);
    } catch {
      toast.error('Failed to create license key');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    reset(DEFAULT_VALUES);
    onClose();
  };

  return (
    <Sheet
      open={isOpen}
      onOpenChange={open => {
        if (!open) handleClose();
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Create license key</SheetTitle>
          <SheetDescription>
            Authorizes Report Runs for one deployment and bills them to this project.
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <AppForm onSubmit={e => void handleSubmit(onSubmit)(e)}>
            <FormLayout>
              <FormSection title='General' name='create-license-key-general'>
                <FormField
                  control={control}
                  name='name'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel tooltip='A human-readable label so you can identify this key later.'>
                        Name
                      </FormLabel>
                      <FormControl>
                        <Input {...field} placeholder='e.g. Production' />
                      </FormControl>
                      <FormDescription>
                        <Accordion variant='common' type='single' collapsible>
                          <AccordionItem value='name-help'>
                            <AccordionTrigger>What should I name my key?</AccordionTrigger>
                            <AccordionContent>
                              Use a name that identifies the deployment this key belongs to, for
                              example &quot;Production&quot; or &quot;Staging&quot;. This makes it
                              easier to audit and revoke keys later.
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={control}
                  name='origin'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel tooltip='The address the licensed deployment is served at.'>
                        Public origin
                      </FormLabel>
                      <FormControl>
                        <Input {...field} placeholder='https://data-marts.example.com' />
                      </FormControl>
                      <FormDescription>
                        <Accordion variant='common' type='single' collapsible>
                          <AccordionItem value='origin-help'>
                            <AccordionTrigger>Which origin should I use?</AccordionTrigger>
                            <AccordionContent>
                              Use the deployment&apos;s <code>PUBLIC_ORIGIN</code>, or{' '}
                              <code>http://localhost:3000</code> for local development. To move a
                              deployment, create a new key and revoke this one.
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FormSection>
            </FormLayout>

            <FormActions>
              <Button type='button' variant='secondary' onClick={handleClose}>
                Cancel
              </Button>
              <Button type='submit' disabled={submitting}>
                {submitting ? <Loader2 className='mr-2 size-4 animate-spin' /> : null}
                Create
              </Button>
            </FormActions>
          </AppForm>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
