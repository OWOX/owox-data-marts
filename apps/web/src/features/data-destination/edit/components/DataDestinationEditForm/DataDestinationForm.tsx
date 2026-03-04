import { useEffect, useMemo, useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import type { CredentialIdentity } from '../../../../../shared/types/credential-identity';
import { CopyCredentialContext } from '../../model/context/copy-credential-context';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { Button } from '@owox/ui/components/button';
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
} from '@owox/ui/components/form';
import { Input } from '@owox/ui/components/input';

import { createFormPayload } from '../../../../../utils';
import { COPY_SOURCE_CREDENTIAL_PLACEHOLDER } from '../../../../../shared/utils/credential-identity-utils';
import {
  DataDestinationType,
  dataDestinationSchema,
  type DataDestinationFormData,
} from '../../../shared';
import { DestinationTypeField } from './DestinationTypeField';
import { EmailFields } from './EmailFields';
import { GoogleSheetsFields } from './GoogleSheetsFields';
import { LookerStudioFields } from './LookerStudioFields';

interface DataDestinationFormProps {
  initialData: DataDestinationFormData | null;
  onSubmit: (
    data: DataDestinationFormData,
    source?: { id: string; title: string } | null
  ) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  isEditMode?: boolean;
  allowedDestinationTypes?: DataDestinationType[];
  destinationId?: string;
}

export function DataDestinationForm({
  initialData,
  onSubmit,
  onCancel,
  onDirtyChange,
  isEditMode,
  allowedDestinationTypes,
  destinationId,
}: DataDestinationFormProps) {
  const form = useForm<DataDestinationFormData>({
    resolver: zodResolver(dataDestinationSchema),
    defaultValues: initialData ?? {
      title: 'New Destination',
      type: DataDestinationType.GOOGLE_SHEETS,
    },
    mode: 'onTouched',
  });

  const [selectedSource, setSelectedSource] = useState<{
    id: string;
    title: string;
    identity: CredentialIdentity | null;
  } | null>(null);

  const handleSourceSelect = (id: string, title: string, identity: CredentialIdentity | null) => {
    setSelectedSource({ id, title, identity });
    // Set placeholder credentialId so Zod validation passes.
    // Credentials are copied server-side; this value is stripped from the payload
    // because dirtyFields.credentials is not set (shouldDirty: false).
    form.setValue('credentials.credentialId', COPY_SOURCE_CREDENTIAL_PLACEHOLDER, {
      shouldDirty: false,
      shouldValidate: true,
    });
  };

  const handleSourceClear = () => {
    setSelectedSource(null);
    // Restore credential field to its original value from initialData
    form.resetField('credentials.credentialId');
  };

  // Get the current destination type
  const destinationType = form.watch('type');

  useEffect(() => {
    onDirtyChange?.(form.formState.isDirty || selectedSource !== null);
  }, [form.formState.isDirty, selectedSource, onDirtyChange]);

  const copyCredentialCtx = useMemo(
    () => ({
      entityId: destinationId,
      onSourceSelect: handleSourceSelect,
      selectedSource,
      onSourceClear: handleSourceClear,
    }),
    [destinationId, selectedSource]
  );

  const handleSubmit = async (data: DataDestinationFormData) => {
    const { dirtyFields } = form.formState;
    const payload = createFormPayload(data);

    // Strip credentials when copying from another source (server handles it via sourceDestinationId)
    // or when no credential fields were touched by the user.
    if (!dirtyFields.credentials || selectedSource) {
      delete (payload as Partial<DataDestinationFormData>).credentials;
    }

    return onSubmit(payload, selectedSource);
  };

  return (
    <Form {...form}>
      <AppForm
        onSubmit={e => {
          void form.handleSubmit(handleSubmit)(e);
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

          <DestinationTypeField
            form={form}
            isEditMode={isEditMode}
            allowedDestinationTypes={allowedDestinationTypes}
          />

          <CopyCredentialContext.Provider value={copyCredentialCtx}>
            {destinationType === DataDestinationType.GOOGLE_SHEETS && (
              <GoogleSheetsFields form={form} />
            )}
          </CopyCredentialContext.Provider>

          {destinationType === DataDestinationType.LOOKER_STUDIO && (
            <LookerStudioFields form={form} />
          )}

          {destinationType === DataDestinationType.EMAIL && (
            <EmailFields form={form} emailsFieldTitle={'Enter user emails list'} />
          )}

          {destinationType === DataDestinationType.SLACK && (
            <EmailFields form={form} emailsFieldTitle={'Enter Slack channel emails list'} />
          )}

          {destinationType === DataDestinationType.MS_TEAMS && (
            <EmailFields
              form={form}
              emailsFieldTitle={'Enter Microsoft Teams channel emails list'}
            />
          )}

          {destinationType === DataDestinationType.GOOGLE_CHAT && (
            <EmailFields form={form} emailsFieldTitle={'Enter Google Chat channel emails list'} />
          )}
        </FormLayout>
        <FormActions>
          <Button
            variant='default'
            type='submit'
            className='w-full'
            aria-label='Save'
            disabled={(!form.formState.isDirty && !selectedSource) || form.formState.isSubmitting}
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
