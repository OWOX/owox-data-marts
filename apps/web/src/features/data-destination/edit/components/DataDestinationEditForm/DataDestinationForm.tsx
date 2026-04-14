import { useCallback, useEffect, useMemo, useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import type { CredentialIdentity } from '../../../../../shared/types/credential-identity';
import type { UserProjection } from '../../../../../shared/types';
import type { UserProjectionDto } from '../../../../../shared/types/api';
import { useOwnerState } from '../../../../../shared/hooks/useOwnerState';
import { OwnersSection } from '../../../../../shared/components/OwnersSection/OwnersSection';
import { ContextPicker } from '../../../../../features/contexts/components/ContextPicker/ContextPicker';
import { AddContextSheet } from '../../../../../features/contexts/components/AddContextSheet/AddContextSheet';
import { contextService } from '../../../../../features/contexts/services/context.service';
import type { MemberWithScopeDto } from '../../../../../features/contexts/types/context.types';
import { UserReference } from '../../../../../shared/components/UserReference/UserReference';
import { useUser } from '../../../../idp/hooks/useAuthState';
import { useIsAdmin } from '../../../../idp/hooks/useRole';
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
  initialData:
    | (DataDestinationFormData & {
        ownerUsers?: UserProjection[];
        createdAt?: Date;
        createdByUser?: UserProjection | null;
        contexts?: { id: string; name: string }[];
      })
    | null;
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
  const { ownerUsers, ownersDirty, handleOwnersChange, consumePendingOwnerIds } =
    useOwnerState(initialOwnerUsers);

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
  const [addContextOpen, setAddContextOpen] = useState(false);
  const [contextsRefreshToken, setContextsRefreshToken] = useState(0);
  // Lazy: fetch members list only when the inner AddContextSheet is opened.
  // Refetch on every open so the list stays fresh across long-lived destination
  // sessions.
  const [contextMembers, setContextMembers] = useState<MemberWithScopeDto[]>([]);
  useEffect(() => {
    if (!addContextOpen) return;
    let cancelled = false;
    void contextService.getMembers().then(list => {
      if (!cancelled) setContextMembers(list);
    });
    return () => {
      cancelled = true;
    };
  }, [addContextOpen]);

  const [selectedSource, setSelectedSource] = useState<{
    id: string;
    title: string;
    identity: CredentialIdentity | null;
  } | null>(null);

  const handleSourceSelect = useCallback(
    (id: string, title: string, identity: CredentialIdentity | null) => {
      setSelectedSource({ id, title, identity });
      // Set placeholder credentialId so Zod validation passes.
      // Credentials are copied server-side; this value is stripped from the payload
      // because dirtyFields.credentials is not set (shouldDirty: false).
      form.setValue('credentials.credentialId', COPY_SOURCE_CREDENTIAL_PLACEHOLDER, {
        shouldDirty: false,
        shouldValidate: true,
      });
    },
    [form]
  );

  const handleSourceClear = useCallback(() => {
    setSelectedSource(null);
    // Restore credential field to its original value from initialData
    form.resetField('credentials.credentialId');
  }, [form]);

  // Get the current destination type
  const destinationType = form.watch('type');

  useEffect(() => {
    onDirtyChange?.(
      form.formState.isDirty ||
        selectedSource !== null ||
        ownersDirty ||
        sharingDirty ||
        contextsDirty
    );
  }, [
    form.formState.isDirty,
    selectedSource,
    ownersDirty,
    sharingDirty,
    contextsDirty,
    onDirtyChange,
  ]);

  const copyCredentialCtx = useMemo(
    () => ({
      entityId: destinationId,
      onSourceSelect: handleSourceSelect,
      selectedSource,
      onSourceClear: handleSourceClear,
    }),
    [destinationId, selectedSource, handleSourceSelect, handleSourceClear]
  );

  const handleSubmit = async (data: DataDestinationFormData) => {
    const { dirtyFields } = form.formState;
    const payload = createFormPayload(data);

    // Strip credentials when copying from another source (server handles it via sourceDestinationId)
    // or when no credential fields were touched by the user.
    if (!dirtyFields.credentials || selectedSource) {
      delete (payload as Partial<DataDestinationFormData>).credentials;
    }

    const ownerIds = consumePendingOwnerIds();
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

    await onSubmit(payload, selectedSource);
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

          <FormSection title='Ownership' defaultOpen={false} name='destination-ownership'>
            <FormItem>
              <FormLabel tooltip='Team members responsible for this destination'>Owners</FormLabel>
              <OwnersSection ownerUsers={ownerUsers} onSave={handleOwnersChange} />
              <Accordion variant='common' type='single' collapsible>
                <AccordionItem value='destination-owners-help'>
                  <AccordionTrigger className='text-sm'>
                    What is a Destination Owner?
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className='text-muted-foreground text-sm'>
                      Destination Owner is direct ownership of this Destination. When the
                      owner&apos;s role is Technical User or Project Admin, they may view, edit,
                      delete, configure Availability, and copy credentials from this Destination —
                      regardless of Availability settings. Assigning Owner to a Business User stores
                      the assignment but grants no maintenance permissions until the role changes.
                    </p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
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
                  refreshToken={contextsRefreshToken}
                  onRequestCreate={
                    isAdmin
                      ? () => {
                          setAddContextOpen(true);
                        }
                      : undefined
                  }
                />
                <Accordion variant='common' type='single' collapsible>
                  <AccordionItem value='destination-contexts-help'>
                    <AccordionTrigger className='text-sm'>What are Contexts?</AccordionTrigger>
                    <AccordionContent>
                      <p className='text-muted-foreground text-sm'>
                        Contexts are business domains (e.g. Marketing, Finance, Sales) used to group
                        Storages, Destinations and Data Marts. They also control access: a member
                        whose role scope is limited to specific contexts will only see resources
                        assigned to those contexts. Assign one or more contexts to make this
                        Destination discoverable to the right people.
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </FormItem>
            </FormSection>
          )}

          {isEditMode && (
            <FormSection title='Availability' defaultOpen={false} name='destination-availability'>
              <FormItem>
                <div className='flex items-center justify-between gap-4'>
                  <FormLabel>Available for use</FormLabel>
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
                <Accordion variant='common' type='single' collapsible>
                  <AccordionItem value='sharing-use-help'>
                    <AccordionTrigger className='text-sm'>
                      What does "Available for use" mean?
                    </AccordionTrigger>
                    <AccordionContent>
                      <p className='text-muted-foreground text-sm'>
                        When enabled, project members can select this destination when configuring
                        reports. Without this, only destination owners and admins can use it.
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </FormItem>
              <FormItem>
                <div className='flex items-center justify-between gap-4'>
                  <FormLabel>Available for maintenance</FormLabel>
                  <Switch
                    checked={sharingState.availableForMaintenance}
                    onCheckedChange={v => {
                      setSharingState(prev => ({ ...prev, availableForMaintenance: v }));
                    }}
                  />
                </div>
                <p className='text-muted-foreground text-xs'>
                  Project members with access can copy credentials, edit, and delete this
                  destination
                </p>
                <Accordion variant='common' type='single' collapsible>
                  <AccordionItem value='sharing-maintenance-help'>
                    <AccordionTrigger className='text-sm'>
                      What does "Available for maintenance" mean?
                    </AccordionTrigger>
                    <AccordionContent>
                      <p className='text-muted-foreground text-sm'>
                        When enabled, project members can copy credentials from this destination,
                        edit its configuration, and delete it. Without this, only owners and admins
                        can perform these actions.
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
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
            disabled={
              (!form.formState.isDirty &&
                !selectedSource &&
                !ownersDirty &&
                !sharingDirty &&
                !contextsDirty) ||
              form.formState.isSubmitting
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
       * preserving unsaved form state. After creation, refresh the picker
       * and auto-check the freshly created context.
       */}
      <AddContextSheet
        isOpen={addContextOpen}
        members={contextMembers}
        onClose={() => {
          setAddContextOpen(false);
        }}
        onCreated={created => {
          setContextIds(prev => (prev.includes(created.id) ? prev : [...prev, created.id]));
          setContextsRefreshToken(t => t + 1);
          setAddContextOpen(false);
        }}
      />
    </Form>
  );
}
