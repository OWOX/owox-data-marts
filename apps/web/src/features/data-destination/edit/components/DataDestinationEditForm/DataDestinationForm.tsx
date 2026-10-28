import { useEffect, useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import type { UserProjection } from '../../../../../shared/types';
import type { UserProjectionDto } from '../../../../../shared/types/api';
import { useOwnerState } from '../../../../../shared/hooks/useOwnerState';
import { OwnersSection } from '../../../../../shared/components/OwnersSection/OwnersSection';
import { ContextPicker } from '../../../../../features/contexts/components/ContextPicker/ContextPicker';
import { AddContextSheet } from '../../../../../features/contexts/components/AddContextSheet/AddContextSheet';
import { useInlineContextCreate } from '../../../../../features/contexts/hooks/useInlineContextCreate';
import { UserReference } from '../../../../../shared/components/UserReference/UserReference';
import { useUser } from '../../../../idp/hooks/useAuthState';
import { useIsAdmin } from '../../../../idp/hooks/useRole';
import {
  ConsumerCredentialField,
  useCredentialFormBinding,
  type Credential,
} from '../../../../credentials';
import { Loader2 } from 'lucide-react';

import { Button } from '@owox/ui/components/button';
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
import { Input } from '@owox/ui/components/input';
import { Switch } from '@owox/ui/components/switch';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';

import {
  applyServerFieldErrors,
  createFormPayload,
  focusFirstInvalidField,
  keepBoundCredential,
  trackEvent,
} from '../../../../../utils';
import { apiErrorMessage, wasErrorToastShown } from '../../../../../app/api';
import toast from 'react-hot-toast';
import {
  extractDestinationFieldErrors,
  toDataDestinationFormField,
} from '../../model/data-destination-server-errors';
import {
  DataDestinationType,
  dataDestinationSchema,
  type DataDestinationFormData,
  type DestinationCredentialSummary,
} from '../../../shared';
import { DestinationTypeField } from './DestinationTypeField';
import { EmailFields } from './EmailFields';
import { GoogleSheetsFields } from './GoogleSheetsFields';
import { LookerStudioFields } from './LookerStudioFields';
import { GoogleChatFields } from './GoogleChatFields';
import type { ContextSummary } from '../../../../contexts/types/context.types';

interface DataDestinationFormProps {
  initialData:
    | (DataDestinationFormData & {
        ownerUsers?: UserProjection[];
        createdAt?: Date;
        createdByUser?: UserProjection | null;
        contexts?: ContextSummary[];
        reusableCredential?: DestinationCredentialSummary | null;
      })
    | null;
  onSubmit: (data: DataDestinationFormData) => Promise<void>;
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
  const {
    form,
    initialCredential,
    initialCredentialId,
    credentialSourceRef,
    handleCredentialChange,
  } = useCredentialFormBinding<DataDestinationFormData, DestinationCredentialSummary>(
    initialData?.reusableCredential,
    ({ hasBinding, initialCredentialId }) => ({
      resolver: keepBoundCredential<DataDestinationFormData>(
        zodResolver(dataDestinationSchema),
        hasBinding
      ),
      defaultValues: {
        ...(initialData ?? { title: 'New Destination', type: DataDestinationType.GOOGLE_SHEETS }),
        reusableCredentialId: initialCredentialId ?? '',
      },
      mode: 'onTouched',
    })
  );
  const [createdCredential, setCreatedCredential] = useState<Credential | null>(null);

  const currentUser = useUser();
  const initialOwnerUsers =
    (initialData?.ownerUsers as UserProjectionDto[] | undefined) ??
    (currentUser
      ? [
          {
            userId: currentUser.id,
            fullName: currentUser.fullName ?? null,
            email: currentUser.email ?? null,
            avatar: currentUser.avatar ?? null,
          },
        ]
      : []);
  const {
    ownerUsers,
    ownersDirty,
    handleOwnersChange,
    pendingOwnerIdsRef,
    consumePendingOwnerIds,
  } = useOwnerState(initialOwnerUsers);

  const sharingInitial = initialData as {
    availableForUse?: boolean;
    availableForMaintenance?: boolean;
  } | null;
  const [sharingState, setSharingState] = useState({
    availableForUse: sharingInitial?.availableForUse ?? true,
    availableForMaintenance: sharingInitial?.availableForMaintenance ?? true,
  });

  const sharingDirty =
    sharingState.availableForUse !== (sharingInitial?.availableForUse ?? true) ||
    sharingState.availableForMaintenance !== (sharingInitial?.availableForMaintenance ?? true);

  const initialContextIds = (initialData?.contexts ?? []).map(c => c.id);
  const [contextIds, setContextIds] = useState<string[]>(initialContextIds);
  const contextsDirty =
    contextIds.length !== initialContextIds.length ||
    contextIds.some(id => !initialContextIds.includes(id));

  const isAdmin = useIsAdmin();
  const inlineContext = useInlineContextCreate({
    enabled: isAdmin,
    onCreated: created => {
      setContextIds(prev => (prev.includes(created.id) ? prev : [...prev, created.id]));
    },
  });

  // Get the current destination type
  const destinationType = form.watch('type');

  useEffect(() => {
    onDirtyChange?.(form.formState.isDirty || ownersDirty || sharingDirty || contextsDirty);
  }, [form.formState.isDirty, ownersDirty, sharingDirty, contextsDirty, onDirtyChange]);

  const handleSubmit = async (data: DataDestinationFormData, event?: { target?: unknown }) => {
    const { dirtyFields } = form.formState;
    const payload = createFormPayload(data);

    // Untouched credentials keep the saved ones; a new Destination has none, so it sends them.
    if (isEditMode && !dirtyFields.credentials) {
      delete (payload as Partial<DataDestinationFormData>).credentials;
    }
    // Google Chat email delivery does not use a Credential.
    const usesCredential =
      data.type === DataDestinationType.GOOGLE_SHEETS ||
      (data.type === DataDestinationType.GOOGLE_CHAT &&
        data.credentials.deliveryMethod === 'webhook');
    const credentialId = usesCredential ? data.reusableCredentialId : undefined;
    const credentialChanged = Boolean(credentialId) && credentialId !== initialCredentialId;
    if (!credentialChanged) {
      delete (payload as { reusableCredentialId?: string }).reusableCredentialId;
    }

    // Read, not consumed: a rejected save keeps the owner change for the retry.
    const ownerIds = pendingOwnerIdsRef.current;
    if (ownerIds !== null) {
      (payload as Record<string, unknown>).ownerIds = ownerIds;
    }

    if (sharingDirty) {
      (payload as Record<string, unknown>).availableForUse = sharingState.availableForUse;
      (payload as Record<string, unknown>).availableForMaintenance =
        sharingState.availableForMaintenance;
    }

    if (contextsDirty) {
      (payload as Record<string, unknown>).contextIds = contextIds;
    }

    try {
      await onSubmit(payload);
      consumePendingOwnerIds();
      if (credentialChanged) {
        trackEvent({
          event: 'destination_credential_selected',
          category: 'DataDestination',
          action: credentialSourceRef.current,
          label: data.type,
          context: null,
          value: null,
        });
      }
    } catch (error) {
      // When the rejection names the values it refused, mark those inputs the same way
      // client-side validation does, so the user sees which field to fix instead of decoding
      // the toast.
      const highlighted = applyServerFieldErrors(
        form.setError,
        extractDestinationFieldErrors(error),
        field => toDataDestinationFormField(data.type, field)
      );
      if (highlighted) {
        focusFirstInvalidField(undefined, event);
      }
      // Reported once whatever was marked: the marked input may not be on screen (another
      // delivery tab, a collapsed section). The API interceptor toasts 400/403/404/5xx; a
      // network failure, any other status or a throw while building the request is reported here.
      if (!wasErrorToastShown(error)) {
        console.error(error);
        toast.error(apiErrorMessage(error, 'Failed to save the Destination'));
      }
    }
  };

  const credentialField = (
    <FormField
      control={form.control}
      name='reusableCredentialId'
      render={({ field }) => (
        <FormItem>
          <FormLabel tooltip='Choose the Credential this Destination connects with'>
            Credential
          </FormLabel>
          <FormControl>
            <ConsumerCredentialField
              consumer='destination'
              consumerType={destinationType}
              // Only a new Destination gets the only fitting Credential picked for it.
              isNew={!isEditMode}
              // An empty id means no Credential is selected, so `||` is intended.
              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
              value={field.value || null}
              summary={initialCredential}
              onChange={(id, source) => {
                // A Drive folder belongs to the account that picked it; another Credential picks its own.
                if (id !== field.value && form.getValues('config.folderUrl')) {
                  form.setValue('config.folderUrl', '', { shouldDirty: true });
                }
                handleCredentialChange(id, source);
              }}
              onCreated={setCreatedCredential}
            />
          </FormControl>
          {initialCredential?.access === 'pending' && !field.value && (
            <FormDescription>Uses its own key until you select a Credential</FormDescription>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <AppForm
        onSubmit={e => {
          void form.handleSubmit(handleSubmit, focusFirstInvalidField)(e);
        }}
      >
        <FormLayout>
          <FormSection title='General'>
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
          </FormSection>

          {destinationType === DataDestinationType.GOOGLE_SHEETS && (
            <GoogleSheetsFields
              form={form}
              credentialField={credentialField}
              summary={initialCredential}
              created={createdCredential}
            />
          )}

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
            <GoogleChatFields form={form} credentialField={credentialField} />
          )}

          <FormSection title='Ownership' defaultOpen={false} name='destination-ownership'>
            <FormItem>
              <FormLabel tooltip='Team members responsible for this destination'>Owners</FormLabel>
              <OwnersSection ownerUsers={ownerUsers} onSave={handleOwnersChange} />
              <FormDescription>
                <Accordion variant='common' type='single' collapsible>
                  <AccordionItem value='destination-owners-help'>
                    <AccordionTrigger>What is a Destination Owner?</AccordionTrigger>
                    <AccordionContent>
                      <p>
                        Destination Owner is direct ownership of this Destination. When the
                        owner&apos;s project role is Data Owner or Project Admin, they may view,
                        edit, delete, and configure Sharing for this Destination — regardless of
                        Sharing settings. Assigning Owner to a Business User stores the assignment
                        but grants no maintenance permissions until the role changes.
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </FormDescription>
            </FormItem>
          </FormSection>

          {isEditMode && destinationId && (
            <FormSection title='Contexts' defaultOpen={false} name='destination-contexts'>
              <FormItem>
                <FormLabel tooltip='Business domain contexts assigned to this destination'>
                  Assigned
                </FormLabel>
                <ContextPicker
                  selectedContextIds={contextIds}
                  onChange={setContextIds}
                  idPrefix='destination-ctx'
                  {...inlineContext.pickerProps}
                />
                <FormDescription>
                  <Accordion variant='common' type='single' collapsible>
                    <AccordionItem value='destination-contexts-help'>
                      <AccordionTrigger>What are Contexts?</AccordionTrigger>
                      <AccordionContent>
                        <p>
                          Contexts are business domains (e.g. Marketing, Finance, Sales) used to
                          group Storages, Destinations and Data Marts. They also control access: a
                          member whose role scope is limited to specific contexts will only see
                          resources assigned to those contexts. Assign one or more contexts to make
                          this Destination discoverable to the right people.
                        </p>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </FormDescription>
              </FormItem>
            </FormSection>
          )}

          {isEditMode && (
            <FormSection title='Sharing' defaultOpen={false} name='destination-availability'>
              <FormItem>
                <div className='flex items-center justify-between gap-4'>
                  <FormLabel>Shared for use</FormLabel>
                  <Switch
                    checked={sharingState.availableForUse}
                    onCheckedChange={v => {
                      setSharingState(prev => ({ ...prev, availableForUse: v }));
                    }}
                  />
                </div>
                <p className='text-muted-foreground text-sm'>
                  Project members can use this destination in their reports
                </p>
                <FormDescription>
                  <Accordion variant='common' type='single' collapsible>
                    <AccordionItem value='sharing-use-help'>
                      <AccordionTrigger>What does "Shared for use" mean?</AccordionTrigger>
                      <AccordionContent>
                        <p>
                          When enabled, project members can select this destination when configuring
                          reports. Without this, only destination owners and admins can use it.
                        </p>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </FormDescription>
              </FormItem>
              <FormItem>
                <div className='flex items-center justify-between gap-4'>
                  <FormLabel>Shared for maintenance</FormLabel>
                  <Switch
                    checked={sharingState.availableForMaintenance}
                    onCheckedChange={v => {
                      setSharingState(prev => ({ ...prev, availableForMaintenance: v }));
                    }}
                  />
                </div>
                <p className='text-muted-foreground text-sm'>
                  Project members with access can edit and delete this destination
                </p>
                <FormDescription>
                  <Accordion variant='common' type='single' collapsible>
                    <AccordionItem value='sharing-maintenance-help'>
                      <AccordionTrigger>What does "Shared for maintenance" mean?</AccordionTrigger>
                      <AccordionContent>
                        <p>
                          When enabled, project members can edit this destination&apos;s
                          configuration and delete it. Without this, only owners and admins can
                          perform these actions.
                        </p>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </FormDescription>
              </FormItem>
            </FormSection>
          )}

          {initialData?.createdAt && (
            <FormSection title='Details' defaultOpen={false} name='destination-details'>
              <FormItem>
                <FormLabel>Created By</FormLabel>
                <div className='text-sm'>
                  {initialData.createdByUser ? (
                    <UserReference userProjection={initialData.createdByUser} variant='full' />
                  ) : (
                    <span className='text-muted-foreground'>Unknown</span>
                  )}
                </div>
              </FormItem>
              <FormItem>
                <FormLabel>Created At</FormLabel>
                <div className='text-muted-foreground text-sm'>
                  {new Date(initialData.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </div>
              </FormItem>
            </FormSection>
          )}
        </FormLayout>
        <FormActions>
          <Button
            variant='default'
            type='submit'
            className='w-full'
            aria-label='Save'
            // In CREATE mode the button stays clickable even while the form is
            // invalid: submitting surfaces validation errors instead of leaving
            // the user with a disabled button and no hint about what is missing.
            disabled={
              form.formState.isSubmitting ||
              (isEditMode &&
                !form.formState.isDirty &&
                !ownersDirty &&
                !sharingDirty &&
                !contextsDirty)
            }
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
      {/*
       * Sheet-in-sheet: the outer Destination sheet stays mounted beneath,
       * preserving unsaved form state. After creation, the hook refreshes
       * the picker and we auto-check the freshly created context.
       */}
      <AddContextSheet {...inlineContext.sheetProps} />
    </Form>
  );
}
