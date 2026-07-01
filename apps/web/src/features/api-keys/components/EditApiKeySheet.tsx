import { useState, useEffect, useRef, type ReactNode } from 'react';
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
import { formatDateShort } from '../../../utils';
import type { ProjectMemberApiKey } from '../types';
import { ApiKeyDocumentationSection, ApiKeyFormLabel } from './ApiKeyFormShared';
import { ApiKeyExpirationValue } from './ApiKeyExpirationValue';

const editApiKeySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
});

type EditApiKeyFormValues = z.infer<typeof editApiKeySchema>;

const API_KEY_UNAVAILABLE_NOTICE =
  'The API Key is only shown once in the creation dialog. If you no longer have it, create a new API key and revoke this one.';

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
  value: ReactNode;
  description: string;
  valueClassName?: string;
  valueTooltip?: string;
}) {
  const valueNode =
    typeof value === 'string' ? (
      <span
        tabIndex={valueTooltip ? 0 : undefined}
        className={cn('text-sm', valueClassName ?? 'text-muted-foreground')}
      >
        {value}
      </span>
    ) : (
      value
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

  const form = useForm<EditApiKeyFormValues>({
    resolver: zodResolver(editApiKeySchema),
    defaultValues: { name: '' },
    mode: 'onChange',
  });

  const { control, handleSubmit, reset } = form;

  const createdAt = apiKey?.createdAt ? formatDateShort(apiKey.createdAt) : 'Unknown';
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
          <SheetDescription>Manage this API key and review integration details.</SheetDescription>
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
                <FormItem>
                  <ApiKeyFormLabel description='Non-secret identifier used in status output, logs, support, and debugging.'>
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
                <MetadataItem
                  label='Expires'
                  value={<ApiKeyExpirationValue expiresAt={apiKey?.expiresAt} focusable />}
                  description='UTC date when this API key stops working. Never means it does not expire automatically.'
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
                  <ApiKeyFormLabel description='Full encoded API Key shown only once. Store it securely.'>
                    API Key
                  </ApiKeyFormLabel>
                  <p className='text-muted-foreground text-sm'>{API_KEY_UNAVAILABLE_NOTICE}</p>
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
