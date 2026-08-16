import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  FormField,
  FormItem,
  FormLabel,
  FormLayout,
  FormMessage,
  FormSection,
} from '@owox/ui/components/form';
import { Input } from '@owox/ui/components/input';
import { Button } from '@owox/ui/components/button';
import { Copy, Loader2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { licenseKeysService } from '../services/license-keys.service';
import { formatDateShort } from '../../../utils';
import type { LicenseKey } from '../types';
import { ExpirationValue } from '../../../shared/components/ExpirationValue/ExpirationValue';
import { LICENSE_KEY_EXPIRED_NOTICE, LICENSE_KEY_EXPIRING_SOON_NOTICE } from '../utils';

const editLicenseKeySchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name must be 255 characters or less'),
});

type EditLicenseKeyFormValues = z.infer<typeof editLicenseKeySchema>;

const LICENSE_KEY_UNAVAILABLE_NOTICE =
  'The license key is only shown once, right after creation. If you no longer have it, create a new key and revoke this one.';

interface EditLicenseKeySheetProps {
  licenseKey: LicenseKey | null;
  onClose: () => void;
  onUpdated: () => void;
  onRevoke: (key: LicenseKey) => void;
}

function MetadataItem({
  label,
  value,
  description,
}: {
  label: string;
  value: ReactNode;
  description: string;
}) {
  return (
    <FormItem>
      <FormLabel tooltip={description}>{label}</FormLabel>
      <span className='text-muted-foreground text-sm'>{value}</span>
    </FormItem>
  );
}

function CopyableItem({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <FormItem>
      <FormLabel tooltip={description}>{label}</FormLabel>
      <div className='bg-muted flex items-center justify-between gap-2 rounded-md px-3 py-2'>
        <code className='truncate text-sm'>{value}</code>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className='size-7 shrink-0'
          aria-label={`Copy ${label}`}
          onClick={() => {
            void navigator.clipboard
              .writeText(value)
              .then(() => toast.success(`${label} copied`))
              .catch(() => toast.error(`Failed to copy ${label}`));
          }}
        >
          <Copy className='size-3.5' />
        </Button>
      </div>
    </FormItem>
  );
}

export function EditLicenseKeySheet({
  licenseKey,
  onClose,
  onUpdated,
  onRevoke,
}: EditLicenseKeySheetProps) {
  const [submitting, setSubmitting] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const form = useForm<EditLicenseKeyFormValues>({
    resolver: zodResolver(editLicenseKeySchema),
    defaultValues: { name: '' },
    mode: 'onChange',
  });

  const { control, handleSubmit, reset } = form;

  useEffect(() => {
    if (licenseKey) {
      reset({ name: licenseKey.name });
    }
  }, [licenseKey, reset]);

  const onSubmit = async (values: EditLicenseKeyFormValues) => {
    if (!licenseKey) return;
    setSubmitting(true);
    try {
      await licenseKeysService.updateKey(licenseKey.licenseKeyId, { name: values.name });
      toast.success('License key name updated');
      onUpdated();
    } catch {
      toast.error('Failed to update license key name');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet
      open={!!licenseKey}
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        onOpenAutoFocus={e => {
          e.preventDefault();
          titleRef.current?.focus({ preventScroll: true });
        }}
      >
        <SheetHeader>
          <SheetTitle ref={titleRef} tabIndex={-1} className='focus:outline-none'>
            License Key Details
          </SheetTitle>
          <SheetDescription>
            Manage this license key and review the deployment it authorizes.
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <AppForm onSubmit={e => void handleSubmit(onSubmit)(e)}>
            <FormLayout>
              <FormSection title='General' name='license-key-general'>
                <FormField
                  control={control}
                  name='name'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel tooltip='Friendly label used to identify this license key.'>
                        Name
                      </FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <CopyableItem
                  label='License key ID'
                  value={licenseKey?.licenseKeyId ?? ''}
                  description='Non-secret identifier used in logs, support, and debugging.'
                />
                <CopyableItem
                  label='Public origin'
                  value={licenseKey?.origin ?? ''}
                  description='The deployment address this key authorizes. It works on this address only.'
                />
                <MetadataItem
                  label='Expires'
                  value={
                    licenseKey ? (
                      <ExpirationValue
                        expiresAt={licenseKey.expiresAt}
                        expiredNotice={LICENSE_KEY_EXPIRED_NOTICE}
                        expiringSoonNotice={LICENSE_KEY_EXPIRING_SOON_NOTICE}
                        focusable
                      />
                    ) : (
                      'Unknown'
                    )
                  }
                  description='Date when this license key stops authorizing Report Runs.'
                />
                <MetadataItem
                  label='Created'
                  value={licenseKey ? formatDateShort(licenseKey.createdAt) : 'Unknown'}
                  description='When this license key was created.'
                />
                <MetadataItem
                  label='Last activity'
                  value={licenseKey?.lastUsedAt ? formatDateShort(licenseKey.lastUsedAt) : 'Never'}
                  description='When this license key was last successfully used by its self-managed deployment.'
                />
              </FormSection>

              <FormSection title='Credentials' name='license-key-credentials'>
                <FormItem>
                  <FormLabel tooltip='Full signed license shown only once. Store it securely.'>
                    License key
                  </FormLabel>
                  <p className='text-muted-foreground text-sm'>{LICENSE_KEY_UNAVAILABLE_NOTICE}</p>
                </FormItem>
              </FormSection>

              <FormSection title='Danger zone' name='license-key-danger-zone' defaultOpen={false}>
                <FormItem>
                  <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                    <div className='space-y-1'>
                      <p className='text-sm font-medium'>Revoke this license key</p>
                      <p className='text-muted-foreground text-sm'>
                        The deployment using it stops running reports immediately. This action
                        cannot be undone.
                      </p>
                    </div>
                    <Button
                      type='button'
                      variant='outline'
                      className='border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/15 sm:shrink-0'
                      disabled={!licenseKey || submitting}
                      onClick={() => {
                        if (licenseKey) onRevoke(licenseKey);
                      }}
                    >
                      <Trash2 className='size-4' />
                      Revoke license key
                    </Button>
                  </div>
                </FormItem>
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
