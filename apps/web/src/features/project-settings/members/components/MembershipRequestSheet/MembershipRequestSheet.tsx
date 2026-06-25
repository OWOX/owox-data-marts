import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@owox/ui/components/sheet';
import { Button } from '@owox/ui/components/button';
import {
  AppForm,
  Form,
  FormActions,
  FormItem,
  FormLabel,
  FormLayout,
  FormSection,
} from '@owox/ui/components/form';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { projectMembersService } from '../../../../../features/project-members/services/project-members.service';
import { PROJECT_ROLE_VALUES, type Role } from '../../../../../features/project-members/types';
import type { MembershipRequestDto } from '../../../../../features/project-members/types';
import type { ContextDto } from '../../../../../features/contexts/types/context.types';
import { useMembersSettings } from '../../model/members-settings.context';
import { ConfirmationDialog } from '../../../../../shared/components/ConfirmationDialog';
import { MemberFormFields } from '../MemberFormFields/MemberFormFields';
import { AddContextSheet } from '../../../../../features/contexts/components/AddContextSheet/AddContextSheet';
import { formatDateShort } from '../../../../../utils/date-formatters';
import { UserAvatar, UserAvatarSize } from '../../../../../shared/components/UserAvatar';
import { generateInitials } from '../../../../../shared/utils';
import { memberRoleFormSchema, type MemberRoleFormValues } from '../../schemas';

interface MembershipRequestSheetProps {
  isOpen: boolean;
  request: MembershipRequestDto | null;
  contexts: ContextDto[];
  onClose: () => void;
  /** `true` when a mutation (approve or decline) actually completed, `false`
   *  when the sheet was simply dismissed. The parent uses this to decide
   *  whether to re-fetch members. */
  onResolved: (mutated: boolean) => void;
}

function clampRole(role: Role | undefined): Role {
  return role && (PROJECT_ROLE_VALUES as readonly Role[]).includes(role) ? role : 'viewer';
}

export function MembershipRequestSheet({
  isOpen,
  request,
  contexts,
  onClose,
  onResolved,
}: MembershipRequestSheetProps) {
  const { optimisticRemoveRequest, members } = useMembersSettings();
  const form = useForm<MemberRoleFormValues>({
    resolver: zodResolver(memberRoleFormSchema),
    defaultValues: { role: 'viewer', roleScope: 'entire_project' },
    mode: 'onChange',
  });
  const { handleSubmit, reset } = form;
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState<'approve' | 'decline' | null>(null);
  const submittingRef = useRef<'approve' | 'decline' | null>(null);
  const [declineConfirm, setDeclineConfirm] = useState(false);
  const [addContextOpen, setAddContextOpen] = useState(false);

  useEffect(() => {
    if (request) {
      reset({ role: clampRole(request.requestedRole), roleScope: 'entire_project' });
      setSelectedContextIds([]);
      setDeclineConfirm(false);
      setAddContextOpen(false);
    }
  }, [request, reset]);

  const handleToggleContext = (contextId: string, checked: boolean) => {
    setSelectedContextIds(prev =>
      checked ? [...prev, contextId] : prev.filter(id => id !== contextId)
    );
  };

  const handleClose = () => {
    if (submitting !== null) return;
    reset({ role: 'viewer', roleScope: 'entire_project' });
    setSelectedContextIds([]);
    onClose();
  };

  const beginSubmit = (action: 'approve' | 'decline'): boolean => {
    if (submittingRef.current !== null) return false;
    submittingRef.current = action;
    setSubmitting(action);
    return true;
  };

  const endSubmit = () => {
    submittingRef.current = null;
    setSubmitting(null);
  };

  const handleApprove = async (values: MemberRoleFormValues) => {
    if (!request) return;
    if (!beginSubmit('approve')) return;
    try {
      const isAdminRole = values.role === 'admin';
      const effectiveContextIds =
        !isAdminRole && values.roleScope === 'selected_contexts' && selectedContextIds.length > 0
          ? selectedContextIds
          : undefined;
      await projectMembersService.approveMembershipRequest(request.requestId, {
        role: values.role,
        roleScope: isAdminRole ? undefined : values.roleScope,
        contextIds: effectiveContextIds,
      });
      optimisticRemoveRequest(request.requestId);
      toast.success(`Approved request from ${request.email}`);
      onResolved(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve request', {
        duration: 8000,
      });
    } finally {
      endSubmit();
    }
  };

  const handleDecline = async () => {
    if (!request) return;
    if (!beginSubmit('decline')) return;
    try {
      await projectMembersService.declineMembershipRequest(request.requestId);
      optimisticRemoveRequest(request.requestId);
      toast.success(`Declined request from ${request.email}`);
      setDeclineConfirm(false);
      onResolved(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to decline request');
    } finally {
      endSubmit();
    }
  };

  return (
    <>
      <Sheet
        open={isOpen}
        onOpenChange={open => {
          if (!open) handleClose();
        }}
      >
        <SheetContent data-testid='membershipRequestSheet'>
          <SheetHeader>
            <SheetTitle>Membership request</SheetTitle>
            <SheetDescription>
              Choose the final role, scope and contexts, then approve or decline.
            </SheetDescription>
          </SheetHeader>

          <Form {...form}>
            <AppForm
              onSubmit={e => {
                e.preventDefault();
              }}
            >
              <FormLayout>
                <FormSection title='Requester' name='membership-request-requester'>
                  <FormItem>
                    <FormLabel tooltip='Display name and email of the requester'>
                      Identity
                    </FormLabel>
                    <div className='flex items-center gap-3'>
                      <UserAvatar
                        avatar={request?.avatar ?? null}
                        initials={generateInitials(request?.fullName ?? null, request?.email ?? '')}
                        displayName={request?.fullName ?? request?.email ?? ''}
                        size={UserAvatarSize.NORMAL}
                      />
                      <div className='flex flex-col'>
                        <span className='font-medium'>
                          {request?.fullName ?? request?.email ?? ''}
                        </span>
                        <span className='text-muted-foreground text-xs'>
                          {request?.email ?? ''}
                        </span>
                      </div>
                    </div>
                  </FormItem>
                  {request?.createdAt && (
                    <FormItem>
                      <FormLabel>Requested date</FormLabel>
                      <span className='text-sm'>{formatDateShort(request.createdAt)}</span>
                    </FormItem>
                  )}
                </FormSection>

                <MemberFormFields
                  contexts={contexts}
                  selectedContextIds={selectedContextIds}
                  onToggleContext={handleToggleContext}
                  disabled={submitting !== null}
                  onRequestCreateContext={() => {
                    setAddContextOpen(true);
                  }}
                  contextIdPrefix='request-ctx'
                />
              </FormLayout>
              <FormActions>
                <Button
                  type='button'
                  className='w-full'
                  onClick={() => {
                    void handleSubmit(handleApprove)();
                  }}
                  disabled={submitting !== null}
                >
                  {submitting === 'approve' ? (
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  ) : null}
                  Approve request
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  className='w-full'
                  onClick={() => {
                    setDeclineConfirm(true);
                  }}
                  disabled={submitting !== null}
                >
                  {submitting === 'decline' ? (
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  ) : null}
                  Decline request
                </Button>
              </FormActions>
            </AppForm>
          </Form>

          {/* Rendered inside SheetContent so Radix treats it as a nested dismissable layer;
              interacting with it then doesn't dismiss the sheet (which caused a re-open loop). */}
          <ConfirmationDialog
            open={declineConfirm}
            onOpenChange={open => {
              if (!open && submitting === null) setDeclineConfirm(false);
            }}
            title='Decline membership request'
            description={
              <span className='mt-2 block'>
                Are you sure you want to decline the request from <strong>{request?.email}</strong>?
                They will be notified the request was rejected.
              </span>
            }
            confirmLabel='Decline'
            cancelLabel='Cancel'
            variant='destructive'
            onConfirm={() => {
              void handleDecline();
            }}
          />
        </SheetContent>
      </Sheet>

      <AddContextSheet
        isOpen={addContextOpen}
        members={members}
        onClose={() => {
          setAddContextOpen(false);
        }}
        onCreated={created => {
          setSelectedContextIds(prev => (prev.includes(created.id) ? prev : [...prev, created.id]));
          setAddContextOpen(false);
        }}
      />
    </>
  );
}
