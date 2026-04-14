import { useState, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@owox/ui/components/sheet';
import { Badge } from '@owox/ui/components/badge';
import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
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
import { Loader2, Check, Copy, Link2, Clock, ShieldCheck } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { contextService } from '../../../../../features/contexts/services/context.service';
import type { InviteMemberResponse } from '../../../../../features/contexts/services/context.service';
import { getRoleDisplayName } from '../../../../../features/idp/utils/role-display-name';
import { SheetLabel } from '../../../../../shared/components/SheetLabel';
import { ContextsCheckboxList } from '../../../../../features/contexts/components/ContextsCheckboxList';
import { AddContextSheet } from '../../../../../features/contexts/components/AddContextSheet/AddContextSheet';
import { useMembersSettings } from '../../model/members-settings.context';
import { useIsAdmin } from '../../../../../features/idp/hooks/useRole';
import type { ContextDto } from '../../../../../features/contexts/types/context.types';

interface InviteMemberSheetProps {
  isOpen: boolean;
  contexts: ContextDto[];
  onClose: () => void;
  onInvited: () => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ['admin', 'editor', 'viewer'] as const;
type Role = (typeof ROLES)[number];
const DEFAULT_ROLE: Role = 'viewer';
type RoleScope = 'entire_project' | 'selected_contexts';
const DEFAULT_SCOPE: RoleScope = 'entire_project';

export function InviteMemberSheet({
  isOpen,
  contexts,
  onClose,
  onInvited,
}: InviteMemberSheetProps) {
  const isAdmin = useIsAdmin();
  const { members, refresh } = useMembersSettings();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>(DEFAULT_ROLE);
  const [roleScope, setRoleScope] = useState<RoleScope>(DEFAULT_SCOPE);
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicLinkResult, setMagicLinkResult] = useState<Extract<
    InviteMemberResponse,
    { kind: 'magic-link' }
  > | null>(null);
  const [copied, setCopied] = useState(false);
  const [addContextOpen, setAddContextOpen] = useState(false);

  const reset = () => {
    setEmail('');
    setRole(DEFAULT_ROLE);
    setRoleScope(DEFAULT_SCOPE);
    setSelectedContextIds([]);
    setError(null);
    setMagicLinkResult(null);
    setCopied(false);
  };

  const handleClose = () => {
    if (sending) return;
    reset();
    onClose();
  };

  const handleDoneMagicLink = () => {
    setMagicLinkResult(null);
    reset();
    onInvited();
    onClose();
  };

  const handleCopyMagicLink = async () => {
    if (!magicLinkResult) return;
    try {
      await navigator.clipboard.writeText(magicLinkResult.magicLink);
      setCopied(true);
      toast.success('Magic link copied to clipboard');
      window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      toast.error('Failed to copy. Select the link and copy manually.');
    }
  };

  const handleSend = useCallback(async () => {
    const trimmed = email.trim();
    if (!EMAIL_REGEX.test(trimmed)) {
      setError('Please enter a valid email address');
      return;
    }
    setError(null);
    setSending(true);
    try {
      const isAdmin = role === 'admin';
      const effectiveContextIds =
        !isAdmin && roleScope === 'selected_contexts' && selectedContextIds.length > 0
          ? selectedContextIds
          : undefined;
      const result = await contextService.inviteMember({
        email: trimmed,
        role,
        roleScope: isAdmin ? undefined : roleScope,
        contextIds: effectiveContextIds,
      });

      if (result.kind === 'magic-link') {
        setMagicLinkResult(result);
      } else {
        toast.success(result.message ?? `Invitation email sent to ${result.email}`, {
          duration: 6000,
        });
        reset();
        onInvited();
        onClose();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send invitation';
      setError(msg);
      toast.error(msg);
    } finally {
      setSending(false);
    }
  }, [email, role, roleScope, selectedContextIds, onInvited, onClose]);

  const handleToggleContext = (contextId: string, checked: boolean) => {
    setSelectedContextIds(prev =>
      checked ? [...prev, contextId] : prev.filter(id => id !== contextId)
    );
  };

  const isAdminRole = role === 'admin';
  const showContextsSection = !isAdminRole && roleScope === 'selected_contexts';

  return (
    <>
      <Sheet
        open={isOpen}
        onOpenChange={open => {
          if (!open) handleClose();
        }}
      >
        <SheetContent>
          {magicLinkResult ? (
            <>
              <SheetHeader>
                <SheetTitle className='flex items-center gap-2'>
                  <span className='bg-primary/10 text-primary flex h-8 w-8 items-center justify-center rounded-full'>
                    <Link2 className='h-4 w-4' />
                  </span>
                  Invitation link ready
                </SheetTitle>
                <SheetDescription>
                  Share this one-time sign-in link with the invitee through any channel (email,
                  Slack, etc.).
                </SheetDescription>
              </SheetHeader>

              <FormLayout>
                <FormSection title='Invitee' name='magic-link-invitee'>
                  <FormItem>
                    <div className='bg-muted/40 flex items-center justify-between gap-3 rounded-md border p-3'>
                      <div className='min-w-0'>
                        <div className='truncate text-sm font-medium'>{magicLinkResult.email}</div>
                        <div className='text-muted-foreground text-xs'>
                          Will join as {getRoleDisplayName(magicLinkResult.role)}
                        </div>
                      </div>
                      <Badge variant='outline' className='shrink-0'>
                        {getRoleDisplayName(magicLinkResult.role)}
                      </Badge>
                    </div>
                  </FormItem>
                </FormSection>

                <FormSection title='One-time link' name='magic-link-url'>
                  <FormItem>
                    <button
                      type='button'
                      onClick={() => {
                        void handleCopyMagicLink();
                      }}
                      className='group border-input hover:border-primary/40 hover:bg-muted/60 bg-muted/30 focus-visible:ring-ring flex w-full items-center gap-3 rounded-md border p-3 text-left transition focus-visible:ring-2 focus-visible:outline-none'
                      aria-label='Copy invitation link'
                    >
                      <Link2 className='text-muted-foreground h-4 w-4 shrink-0' />
                      <span
                        className='text-foreground flex-1 truncate font-mono text-xs'
                        title={magicLinkResult.magicLink}
                      >
                        {magicLinkResult.magicLink}
                      </span>
                      <span className='text-muted-foreground group-hover:text-foreground shrink-0 text-xs'>
                        {copied ? (
                          <Check className='h-4 w-4 text-green-600' />
                        ) : (
                          <Copy className='h-4 w-4' />
                        )}
                      </span>
                    </button>
                    <div className='text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs'>
                      <span className='inline-flex items-center gap-1'>
                        <ShieldCheck className='h-3.5 w-3.5' />
                        Single-use
                      </span>
                      {magicLinkResult.expiresAt && (
                        <span className='inline-flex items-center gap-1'>
                          <Clock className='h-3.5 w-3.5' />
                          Expires {new Date(magicLinkResult.expiresAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </FormItem>
                </FormSection>
              </FormLayout>

              <FormActions>
                <Button
                  type='button'
                  className='w-full'
                  onClick={() => {
                    void handleCopyMagicLink();
                  }}
                >
                  {copied ? <Check className='mr-2 h-4 w-4' /> : <Copy className='mr-2 h-4 w-4' />}
                  {copied ? 'Copied to clipboard' : 'Copy invitation link'}
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  className='w-full'
                  onClick={handleDoneMagicLink}
                >
                  Done
                </Button>
              </FormActions>
            </>
          ) : (
            <>
              <SheetHeader>
                <SheetTitle>Invite member</SheetTitle>
                <SheetDescription>
                  Send an invitation via email. The member will receive a link to join the project.
                </SheetDescription>
              </SheetHeader>

              <FormLayout>
                <FormSection title='General' name='invite-general'>
                  <FormItem>
                    <SheetLabel htmlFor='invite-email' tooltip="The member's email address">
                      Email
                    </SheetLabel>
                    <Input
                      id='invite-email'
                      type='email'
                      value={email}
                      placeholder='user@company.com'
                      onChange={e => {
                        setEmail(e.target.value);
                        setError(null);
                      }}
                      disabled={sending}
                      autoFocus
                    />
                    {error && <p className='text-destructive text-xs'>{error}</p>}
                  </FormItem>

                  <FormItem>
                    <SheetLabel
                      htmlFor='invite-role'
                      tooltip='Project role granted once the invitation is accepted'
                    >
                      Role
                    </SheetLabel>
                    <Select
                      value={role}
                      onValueChange={v => {
                        setRole(v as Role);
                      }}
                      disabled={sending}
                    >
                      <SelectTrigger id='invite-role' className='w-full'>
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
                      <AccordionItem value='invite-role-help'>
                        <AccordionTrigger className='text-sm'>
                          Which role should I pick?
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className='text-muted-foreground space-y-3 text-sm'>
                            <p>
                              <strong>Business User</strong> — sees accessible Data Marts and
                              Reports, creates Reports for Data Marts available for reporting,
                              manages Reports they own (edit, delete, change owners), manages Report
                              Triggers under their Reports, and uses Destinations available for use.
                              Cannot create, edit, or delete Data Marts, Data Mart Triggers, or
                              Storages.
                            </p>
                            <p>
                              <strong>Technical User</strong> — everything a Business User may do,
                              plus: creates, edits, and deletes Data Marts, Data Mart Triggers, and
                              Storages; edits and deletes Reports project-wide; changes Report
                              owners; manages Report Triggers project-wide.
                            </p>
                            <p>
                              <strong>Project Admin</strong> — everything a Technical User may do,
                              plus: manages Project Members, manages billing, and manages general
                              Project settings such as the Project title.
                            </p>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </FormItem>
                </FormSection>

                {isAdminRole ? (
                  <FormSection title='Access' collapsible={false} name='invite-admin-access'>
                    <FormItem>
                      <p className='text-muted-foreground text-sm'>
                        Project Admin has project-wide access. Scope and context assignments do not
                        apply.
                      </p>
                    </FormItem>
                  </FormSection>
                ) : (
                  <FormSection title='Scope' name='invite-scope'>
                    <FormItem>
                      <SheetLabel
                        htmlFor='invite-scope'
                        tooltip='Controls what resources this member can see by default after they accept the invitation'
                      >
                        Role scope
                      </SheetLabel>
                      <Select
                        value={roleScope}
                        onValueChange={v => {
                          setRoleScope(v as RoleScope);
                        }}
                        disabled={sending}
                      >
                        <SelectTrigger id='invite-scope' className='w-full'>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='entire_project'>Entire project</SelectItem>
                          <SelectItem value='selected_contexts'>Selected contexts only</SelectItem>
                        </SelectContent>
                      </Select>
                      <Accordion variant='common' type='single' collapsible>
                        <AccordionItem value='invite-scope-help'>
                          <AccordionTrigger className='text-sm'>
                            What do the scopes mean?
                          </AccordionTrigger>
                          <AccordionContent>
                            <p className='text-muted-foreground text-sm'>
                              <strong>Entire project</strong> — the member sees every shared
                              resource in the project (subject to role and ownership rules).
                              <br />
                              <strong>Selected contexts only</strong> — the member sees resources
                              only if they share at least one assigned context, or if the member is
                              an owner. Picking this with no contexts below is a valid "no shared
                              access" state.
                            </p>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    </FormItem>
                  </FormSection>
                )}

                {showContextsSection && (
                  <FormSection title='Contexts' name='invite-contexts'>
                    <FormItem>
                      <SheetLabel tooltip='Contexts pre-assigned to this member once they accept the invitation'>
                        Assign to contexts (optional)
                      </SheetLabel>
                      <ContextsCheckboxList
                        idPrefix='invite-ctx'
                        contexts={contexts}
                        selectedIds={selectedContextIds}
                        onToggle={handleToggleContext}
                        disabled={sending}
                        onRequestCreate={
                          isAdmin
                            ? () => {
                                setAddContextOpen(true);
                              }
                            : undefined
                        }
                      />
                    </FormItem>
                  </FormSection>
                )}
              </FormLayout>

              <FormActions>
                <Button
                  type='button'
                  className='w-full'
                  onClick={() => {
                    void handleSend();
                  }}
                  disabled={sending || email.trim().length === 0}
                >
                  {sending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                  Send invitation
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  className='w-full'
                  onClick={handleClose}
                  disabled={sending}
                >
                  Cancel
                </Button>
              </FormActions>
            </>
          )}
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
