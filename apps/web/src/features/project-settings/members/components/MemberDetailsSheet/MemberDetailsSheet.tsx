import { useState, useEffect, useCallback } from 'react';
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
import { FormActions, FormItem, FormLayout, FormSection } from '@owox/ui/components/form';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { Loader2, User } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { contextService } from '../../../../../features/contexts/services/context.service';
import { getRoleDisplayName } from '../../../../../features/idp/utils/role-display-name';
import { SheetLabel } from '../../../../../shared/components/SheetLabel';
import { ContextsCheckboxList } from '../../../../../features/contexts/components/ContextsCheckboxList';
import { AddContextSheet } from '../../../../../features/contexts/components/AddContextSheet/AddContextSheet';
import { useMembersSettings } from '../../model/members-settings.context';
import { useIsAdmin } from '../../../../../features/idp/hooks/useRole';
import type {
  ContextDto,
  MemberWithScopeDto,
} from '../../../../../features/contexts/types/context.types';

interface MemberDetailsSheetProps {
  isOpen: boolean;
  member: MemberWithScopeDto | null;
  contexts: ContextDto[];
  onClose: () => void;
  onSaved: () => void;
}

const ROLES = ['admin', 'editor', 'viewer'] as const;
type Role = (typeof ROLES)[number];

export function MemberDetailsSheet({
  isOpen,
  member,
  contexts,
  onClose,
  onSaved,
}: MemberDetailsSheetProps) {
  const isAdmin = useIsAdmin();
  const { members, refresh } = useMembersSettings();
  const [role, setRole] = useState<Role>('viewer');
  const [roleScope, setRoleScope] = useState('entire_project');
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [addContextOpen, setAddContextOpen] = useState(false);

  useEffect(() => {
    if (member) {
      setRole(member.role as Role);
      setRoleScope(member.roleScope);
      setSelectedContextIds([...member.contextIds]);
    }
  }, [member]);

  const handleToggle = (contextId: string, checked: boolean) => {
    setSelectedContextIds(prev =>
      checked ? [...prev, contextId] : prev.filter(id => id !== contextId)
    );
  };

  const handleSave = useCallback(async () => {
    if (!member) return;
    setSaving(true);
    try {
      const result = await contextService.updateMember(member.userId, {
        role,
        roleScope,
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
  }, [member, role, roleScope, selectedContextIds, onSaved]);

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
            <SheetTitle>{member.displayName ?? member.email}</SheetTitle>
            <SheetDescription>{member.email}</SheetDescription>
          </SheetHeader>

          <FormLayout>
            <FormSection title='General' name='member-details-general'>
              <FormItem>
                <SheetLabel tooltip='Display name and email of the member'>Identity</SheetLabel>
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

              <FormItem>
                <SheetLabel htmlFor='member-role' tooltip='Project role granted to this member'>
                  Role
                </SheetLabel>
                <Select
                  value={role}
                  onValueChange={v => {
                    setRole(v as Role);
                  }}
                  disabled={saving}
                >
                  <SelectTrigger id='member-role' className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map(r => (
                      <SelectItem key={r} value={r}>
                        {getRoleDisplayName(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Accordion variant='common' type='single' collapsible>
                  <AccordionItem value='member-role-help'>
                    <AccordionTrigger className='text-sm'>
                      Which role should I pick?
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className='text-muted-foreground space-y-3 text-sm'>
                        <p>
                          <strong>Business User</strong> — sees accessible Data Marts and Reports,
                          creates Reports for Data Marts available for reporting, manages Reports
                          they own (edit, delete, change owners), manages Report Triggers under
                          their Reports, and uses Destinations available for use. Cannot create,
                          edit, or delete Data Marts, Data Mart Triggers, or Storages.
                        </p>
                        <p>
                          <strong>Technical User</strong> — everything a Business User may do, plus:
                          creates, edits, and deletes Data Marts, Data Mart Triggers, and Storages;
                          edits and deletes Reports project-wide; changes Report owners; manages
                          Report Triggers project-wide.
                        </p>
                        <p>
                          <strong>Project Admin</strong> — everything a Technical User may do, plus:
                          manages Project Members, manages billing, and manages general Project
                          settings such as the Project title.
                        </p>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </FormItem>
            </FormSection>

            {isAdminRole ? (
              <FormSection title='Access' collapsible={false} name='member-details-admin'>
                <FormItem>
                  <p className='text-muted-foreground text-sm'>
                    Project Admin has project-wide access. Scope and context assignments do not
                    apply.
                  </p>
                </FormItem>
              </FormSection>
            ) : (
              <>
                <FormSection title='Scope' name='member-details-scope'>
                  <FormItem>
                    <SheetLabel
                      htmlFor='member-scope'
                      tooltip='Controls what resources this member can see by default'
                    >
                      Role scope
                    </SheetLabel>
                    <Select value={roleScope} onValueChange={setRoleScope} disabled={saving}>
                      <SelectTrigger id='member-scope' className='w-full'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='entire_project'>Entire project</SelectItem>
                        <SelectItem value='selected_contexts'>Selected contexts only</SelectItem>
                      </SelectContent>
                    </Select>
                    <Accordion variant='common' type='single' collapsible>
                      <AccordionItem value='scope-help'>
                        <AccordionTrigger className='text-sm'>
                          What do the scopes mean?
                        </AccordionTrigger>
                        <AccordionContent>
                          <p className='text-muted-foreground text-sm'>
                            <strong>Entire project</strong> — the member sees every shared resource
                            in the project (subject to role and ownership rules).
                            <br />
                            <strong>Selected contexts only</strong> — the member sees resources only
                            if they share at least one assigned context, or if the member is an
                            owner.
                          </p>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </FormItem>
                </FormSection>

                <FormSection title='Contexts' name='member-details-contexts'>
                  <FormItem>
                    <SheetLabel tooltip='Contexts assigned to this member — controls visibility when scope is "Selected contexts"'>
                      Assigned contexts
                    </SheetLabel>
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
                    <Accordion variant='common' type='single' collapsible>
                      <AccordionItem value='member-contexts-help'>
                        <AccordionTrigger className='text-sm'>What are Contexts?</AccordionTrigger>
                        <AccordionContent>
                          <p className='text-muted-foreground text-sm'>
                            Contexts are business domains (e.g. Marketing, Finance, Sales) used to
                            group Storages, Destinations and Data Marts. When this member&apos;s
                            role scope is set to <strong>Selected contexts only</strong>, they will
                            see a resource only if it is assigned to at least one of the contexts
                            checked here (ownership still overrides visibility). With scope{' '}
                            <strong>Entire project</strong>, these assignments have no effect.
                          </p>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </FormItem>
                </FormSection>
              </>
            )}
          </FormLayout>

          <FormActions>
            <Button
              type='button'
              className='w-full'
              onClick={() => {
                void handleSave();
              }}
              disabled={saving}
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
