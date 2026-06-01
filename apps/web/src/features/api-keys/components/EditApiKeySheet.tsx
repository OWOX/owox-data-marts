import { useState, useEffect, useRef } from 'react';
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
  FormLayout,
  FormMessage,
  FormSection,
} from '@owox/ui/components/form';
import { Input } from '@owox/ui/components/input';
import { Button } from '@owox/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { cn } from '@owox/ui/lib/utils';
import { Copy, Loader2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiKeysService } from '../services/api-keys.service';
import { useFlags } from '../../../app/store/hooks/useFlags';
import { formatDateOnly, formatDateShort } from '../../../utils';
import type { ProjectMemberApiKey } from '../types';
import { ApiKeyDocumentationSection, ApiKeyFormLabel } from './ApiKeyFormShared';
import {
  API_KEY_EXPIRING_SOON_CLASS_NAME,
  API_KEY_EXPIRING_SOON_NOTICE,
  isApiKeyExpiringSoon,
} from '../utils';

const editApiKeySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
});

type EditApiKeyFormValues = z.infer<typeof editApiKeySchema>;

const SECRET_UNAVAILABLE_NOTICE =
  'The API key secret is only shown once in the creation dialog. If you no longer have it, create a new API key and revoke this one.';

interface EditApiKeySheetProps {
  apiKey: ProjectMemberApiKey | null;
  onClose: () => void;
  onUpdated: () => void;
  onRevoke: (key: ProjectMemberApiKey) => void;
}

function MetadataItem({
  label,
  value,
  description,
  valueClassName,
  valueTooltip,
}: {
  label: string;
  value: string;
  description: string;
  valueClassName?: string;
  valueTooltip?: string;
}) {
  const valueNode = (
    <span
      tabIndex={valueTooltip ? 0 : undefined}
      className={cn('text-sm', valueClassName ?? 'text-muted-foreground')}
    >
      {value}
    </span>
  );

  return (
    <FormItem>
      <ApiKeyFormLabel description={description}>{label}</ApiKeyFormLabel>
      {valueTooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{valueNode}</TooltipTrigger>
          <TooltipContent side='top' align='start'>
            {valueTooltip}
          </TooltipContent>
        </Tooltip>
      ) : (
        valueNode
      )}
    </FormItem>
  );
}

export function EditApiKeySheet({ apiKey, onClose, onUpdated, onRevoke }: EditApiKeySheetProps) {
  const [submitting, setSubmitting] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const { flags } = useFlags();

  const form = useForm<EditApiKeyFormValues>({
    resolver: zodResolver(editApiKeySchema),
    defaultValues: { name: '' },
    mode: 'onChange',
  });

  const { control, handleSubmit, reset } = form;

  const apiOrigin = flags?.PUBLIC_ORIGIN as string;
  const createdAt = apiKey?.createdAt ? formatDateShort(apiKey.createdAt) : 'Unknown';
  const expiresAt = apiKey?.expiresAt
    ? formatDateOnly(apiKey.expiresAt, { timeZone: 'UTC' })
    : 'Never';
  const expiresSoon = isApiKeyExpiringSoon(apiKey?.expiresAt);
  const lastAuthenticatedAt = apiKey?.lastAuthenticatedAt
    ? formatDateShort(apiKey.lastAuthenticatedAt)
    : 'Never';

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

  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  return (
    <Sheet
      open={!!apiKey}
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
            API Key Details
          </SheetTitle>
          <SheetDescription>Manage this API key and copy values for integrations.</SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <AppForm onSubmit={e => void handleSubmit(onSubmit)(e)}>
            <FormLayout>
              <FormSection title='General' name='api-key-general'>
                <FormField
                  control={control}
                  name='name'
                  render={({ field }) => (
                    <FormItem>
                      <ApiKeyFormLabel description='Friendly label used to identify this API key.'>
                        Name
                      </ApiKeyFormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <MetadataItem
                  label='Expires'
                  value={expiresAt}
                  description='UTC date when this API key stops working. Never means it does not expire automatically.'
                  valueClassName={expiresSoon ? API_KEY_EXPIRING_SOON_CLASS_NAME : undefined}
                  valueTooltip={expiresSoon ? API_KEY_EXPIRING_SOON_NOTICE : undefined}
                />
                <MetadataItem
                  label='Created'
                  value={createdAt}
                  description='When this API key was created.'
                />
                <MetadataItem
                  label='Last authenticated'
                  value={lastAuthenticatedAt}
                  description='Most recent successful authentication with this API key.'
                />
              </FormSection>

              <FormSection title='Credentials' name='api-key-credentials'>
                <FormItem>
                  <ApiKeyFormLabel description='Base URL for API requests from external tools.'>
                    API Origin
                  </ApiKeyFormLabel>
                  <div className='bg-muted flex items-center justify-between gap-2 rounded-md px-3 py-2'>
                    <FormControl>
                      <input
                        value={apiOrigin}
                        readOnly
                        tabIndex={-1}
                        className='min-w-0 flex-1 bg-transparent font-mono text-sm outline-none'
                      />
                    </FormControl>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      className='size-7'
                      aria-label='Copy API Origin'
                      onClick={() => {
                        void copyToClipboard(apiOrigin, 'API Origin');
                      }}
                    >
                      <Copy className='size-3.5' />
                    </Button>
                  </div>
                </FormItem>

                <FormItem>
                  <ApiKeyFormLabel description='Public identifier for this API key.'>
                    API Key ID
                  </ApiKeyFormLabel>
                  <div className='bg-muted flex items-center justify-between gap-2 rounded-md px-3 py-2'>
                    <code className='text-sm'>{apiKey?.apiKeyId}</code>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      className='size-7'
                      aria-label='Copy API Key ID'
                      onClick={() => {
                        if (apiKey) void copyToClipboard(apiKey.apiKeyId, 'API Key ID');
                      }}
                    >
                      <Copy className='size-3.5' />
                    </Button>
                  </div>
                </FormItem>

                <FormItem>
                  <ApiKeyFormLabel description='Secret credential shown only once. Store it securely.'>
                    API Key Secret
                  </ApiKeyFormLabel>
                  <p className='text-muted-foreground text-sm'>{SECRET_UNAVAILABLE_NOTICE}</p>
                </FormItem>
              </FormSection>

              <ApiKeyDocumentationSection name='api-key-documentation' />

              <FormSection title='Danger zone' name='api-key-danger-zone' defaultOpen={false}>
                <FormItem>
                  <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                    <div className='space-y-1'>
                      <p className='text-sm font-medium'>Revoke this API key</p>
                      <p className='text-muted-foreground text-sm'>
                        Stop future authentications for this key. This action cannot be undone.
                      </p>
                    </div>
                    <Button
                      type='button'
                      variant='outline'
                      className='border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/15 sm:shrink-0'
                      disabled={!apiKey || submitting}
                      onClick={() => {
                        if (apiKey) onRevoke(apiKey);
                      }}
                    >
                      <Trash2 className='size-4' />
                      Revoke API Key
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
