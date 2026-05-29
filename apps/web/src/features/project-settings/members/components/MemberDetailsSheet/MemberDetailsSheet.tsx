import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Button } from '@owox/ui/components/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
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
import { Loader2, User } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { projectMembersService } from '../../../../../features/project-members/services/project-members.service';
import { getRoleDisplayName } from '../../../../../features/idp/utils/role-display-name';
import { ContextsCheckboxList } from '../../../../../features/contexts/components/ContextsCheckboxList';
import { AddContextSheet } from '../../../../../features/contexts/components/AddContextSheet/AddContextSheet';
import { useMembersSettings } from '../../model/members-settings.context';
import { useIsAdmin } from '../../../../../features/idp/hooks/useRole';
import {
  PROJECT_ROLE_VALUES,
  ROLE_SCOPE_VALUES,
} from '../../../../../features/project-members/types';
import type {
  ContextDto,
  MemberWithScopeDto,
} from '../../../../../features/contexts/types/context.types';

const memberDetailsSchema = z.object({
  role: z.enum(PROJECT_ROLE_VALUES),
  roleScope: z.enum(ROLE_SCOPE_VALUES),
});

type MemberDetailsFormValues = z.infer<typeof memberDetailsSchema>;

const DEFAULT_VALUES: MemberDetailsFormValues = {
  role: 'viewer',
  roleScope: 'entire_project',
};

interface MemberDetailsSheetProps {
  isOpen: boolean;
  member: MemberWithScopeDto | null;
  contexts: ContextDto[];
  onClose: () => void;
  onSaved: () => void;
}

export function MemberDetailsSheet({
  isOpen,
  member,
  contexts,
  onClose,
  onSaved,
}: MemberDetailsSheetProps) {
  const form = useForm<MemberDetailsFormValues>({
    resolver: zodResolver(memberDetailsSchema),
    defaultValues: DEFAULT_VALUES,
    mode: 'onChange',
  });
  const { control, handleSubmit, watch, reset: resetForm, formState } = form;
  const role = watch('role');
  const roleScope = watch('roleScope');
  const isAdmin = useIsAdmin();
  const { members, refresh } = useMembersSettings();
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [addContextOpen, setAddContextOpen] = useState(false);

  // Sync form + local context selection whenever the sheet opens for a new
  // member (the same component is mounted across rows).
  useEffect(() => {
    if (member) {
      resetForm({
        role: member.role,
        roleScope: member.roleScope,
      });
      setSelectedContextIds([...member.contextIds]);
    }
  }, [member, resetForm]);

  const initialContextIds = useMemo(() => member?.contextIds ?? [], [member]);
  const contextsDirty = useMemo(() => {
    if (selectedContextIds.length !== initialContextIds.length) return true;
    const a = [...selectedContextIds].sort();
    const b = [...initialContextIds].sort();
    return a.some((id, i) => id !== b[i]);
  }, [selectedContextIds, initialContextIds]);

  const handleToggle = (contextId: string, checked: boolean) => {
    setSelectedContextIds(prev =>
      checked ? [...prev, contextId] : prev.filter(id => id !== contextId)
    );
  };

  const onSubmit = useCallback(
    async (values: MemberDetailsFormValues) => {
      if (!member) return;
      setSaving(true);
      try {
        const result = await projectMembersService.updateMember(member.userId, {
          role: values.role,
          roleScope: values.roleScope,
          contextIds: selectedContextIds,
        });
        toast.success('Member settings updated');
        if (result.roleStatus === 'pending' && result.message) {
          toast(result.message, { duration: 8000, icon: 'ℹ️' });
        }
        onSaved();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to save');
      } finally {
        setSaving(false);
      }
    },
    [member, selectedContextIds, onSaved]
  );

  if (!member) return null;

  const isAdminRole = role === 'admin';

  return (
    <>
      <Sheet
        open={isOpen}
        onOpenChange={open => {
          if (!open) onClose();
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Configure member</SheetTitle>
            <SheetDescription>Customize role, scope and contexts for this member</SheetDescription>
          </SheetHeader>

          <Form {...form}>
            <AppForm
              onSubmit={e => {
                void handleSubmit(onSubmit)(e);
              }}
            >
              <FormLayout>
                <FormSection title='General' name='member-details-general'>
                  <FormItem>
                    <FormLabel tooltip='Display name and email of the member'>Identity</FormLabel>
                    <div className='flex items-center gap-3'>
                      {member.avatarUrl ? (
                        <img
                          src={member.avatarUrl}
                          alt={member.displayName ?? member.email}
                          className='h-10 w-10 rounded-full object-cover'
                        />
                      ) : (
                        <div className='bg-muted text-muted-foreground flex h-10 w-10 items-center justify-center rounded-full'>
                          <User className='h-5 w-5' />
                        </div>
                      )}
                      <div className='flex flex-col'>
                        <span className='font-medium'>{member.displayName ?? member.email}</span>
                        <span className='text-muted-foreground text-xs'>{member.email}</span>
                      </div>
                    </div>
                  </FormItem>

                  <FormField
                    control={control}
                    name='role'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel tooltip='Project role granted to this member'>Role</FormLabel>
                        <FormControl>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                            disabled={saving}
                          >
                            <SelectTrigger className='w-full'>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PROJECT_ROLE_VALUES.map(r => (
                                <SelectItem key={r} value={r}>
                                  {getRoleDisplayName(r)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                        <FormDescription>
                          <Accordion variant='common' type='single' collapsible>
                            <AccordionItem value='member-role-help'>
                              <AccordionTrigger>Which role should I pick?</AccordionTrigger>
                              <AccordionContent>
                                <p className='mb-2'>
                                  <strong>Business User</strong> — sees accessible Data Marts and
                                  Reports, creates Reports for Data Marts shared for reporting,
                                  manages Reports they own (edit, delete, change owners), manages
                                  Report Triggers under their Reports, and uses Destinations shared
                                  for use. Cannot create, edit, or delete Data Marts, Data Mart
                                  Triggers, or Storages.
                                </p>
                                <p className='mb-2'>
                                  <strong>Technical User</strong> — everything a Business User may
                                  do, plus: creates, edits, and deletes Data Marts, Data Mart
                                  Triggers, and Storages; edits and deletes Reports project-wide;
                                  changes Report owners; manages Report Triggers project-wide.
                                </p>
                                <p>
                                  <strong>Project Admin</strong> — everything a Technical User may
                                  do, plus: manages Project Members, manages billing, and manages
                                  general Project settings such as the Project title.
                                </p>
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                </FormSection>

                {isAdminRole ? (
                  <FormSection title='Access' collapsible={false} name='member-details-admin'>
                    <FormItem className='mt-2'>
                      <p className='text-muted-foreground text-sm'>
                        Project Admin has project-wide access. Scope and context assignments do not
                        apply.
                      </p>
                    </FormItem>
                  </FormSection>
                ) : (
                  <>
                    <FormSection title='Scope' name='member-details-scope'>
                      <FormField
                        control={control}
                        name='roleScope'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel tooltip='Controls what resources this member can see by default'>
                              Role scope
                            </FormLabel>
                            <FormControl>
                              <Select
                                value={field.value}
                                onValueChange={field.onChange}
                                disabled={saving}
                              >
                                <SelectTrigger className='w-full'>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value='entire_project'>Entire project</SelectItem>
                                  <SelectItem value='selected_contexts'>
                                    Selected contexts only
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </FormControl>
                            <FormMessage />
                            <FormDescription>
                              <Accordion variant='common' type='single' collapsible>
                                <AccordionItem value='scope-help'>
                                  <AccordionTrigger>What do the scopes mean?</AccordionTrigger>
                                  <AccordionContent>
                                    <p className='mb-2'>
                                      <strong>Entire project</strong> — the member sees every shared
                                      resource in the project (subject to role and ownership rules).
                                    </p>
                                    <p className='mb-2'>
                                      <strong>Selected contexts only</strong> — the member sees
                                      resources only if they share at least one assigned context, or
                                      if the member is an owner.
                                    </p>
                                  </AccordionContent>
                                </AccordionItem>
                              </Accordion>
                            </FormDescription>
                          </FormItem>
                        )}
                      />
                    </FormSection>

                    {roleScope === 'selected_contexts' && (
                      <FormSection title='Contexts' name='member-details-contexts'>
                        <FormItem>
                          <FormLabel tooltip='Contexts assigned to this member — controls visibility when scope is "Selected contexts"'>
                            Assigned contexts
                          </FormLabel>
                          <ContextsCheckboxList
                            idPrefix='member-ctx'
                            contexts={contexts}
                            selectedIds={selectedContextIds}
                            onToggle={handleToggle}
                            disabled={saving}
                            onRequestCreate={
                              isAdmin
                                ? () => {
                                    setAddContextOpen(true);
                                  }
                                : undefined
                            }
                          />
                          <FormDescription>
                            <Accordion variant='common' type='single' collapsible>
                              <AccordionItem value='member-contexts-help'>
                                <AccordionTrigger>What are Contexts?</AccordionTrigger>
                                <AccordionContent>
                                  <p>
                                    Contexts are business domains (e.g. Marketing, Finance, Sales)
                                    used to group Storages, Destinations and Data Marts. When this
                                    member&apos;s role scope is set to{' '}
                                    <strong>Selected contexts only</strong>, they will see a
                                    resource only if it is assigned to at least one of the contexts
                                    checked here (ownership still overrides visibility). With scope{' '}
                                    <strong>Entire project</strong>, these assignments have no
                                    effect.
                                  </p>
                                </AccordionContent>
                              </AccordionItem>
                            </Accordion>
                          </FormDescription>
                        </FormItem>
                      </FormSection>
                    )}
                  </>
                )}
              </FormLayout>

              <FormActions>
                <Button
                  type='submit'
                  className='w-full'
                  disabled={saving || (!formState.isDirty && !contextsDirty)}
                >
                  {saving && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                  Save
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  className='w-full'
                  onClick={onClose}
                  disabled={saving}
                >
                  Cancel
                </Button>
              </FormActions>
            </AppForm>
          </Form>
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
          void refresh();
        }}
      />
    </>
  );
}
