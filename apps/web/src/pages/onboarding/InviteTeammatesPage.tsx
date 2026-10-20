import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { CornerDownLeft, Loader2, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button } from '@owox/ui/components/button';
import { extractApiError } from '../../app/api';
import { useIsAdmin } from '../../features/idp';
import { projectMembersService } from '../../features/project-members/services/project-members.service';
import type { Role } from '../../features/project-members/types';
import { trackEvent } from '../../utils/data-layer';
import { InviteRolePicker } from './InviteRolePicker';
import {
  MAX_INVITE_EMAILS,
  isValidEmail,
  resolveContinueTarget,
  splitEmailInput,
} from './invite-teammates.utils';

// TODO: placeholder copy — replace with the final product copy.
const COPY = {
  title: 'Invite your Data Owner',
  subtitle:
    'Bring in the teammate who manages your data warehouse, so they can connect storages and build Data Marts. You can change roles later in Project Settings → Members.',
  hint: 'to add as many people as you need',
};

const DEFAULT_ROLE: Role = 'editor';

/**
 * First-run step shown once, right after the sign-up questionnaire: the new project's only
 * admin invites the teammates who will set the project up. Sending or skipping continues to
 * the page the sign-in flow was heading to (`?redirect=`).
 *
 * Only the OWOX sign-up questionnaire links here, and its IDP always emails the invitation
 * itself, so there is no magic link to show (unlike the Members page invite sheet).
 */
export function InviteTeammatesPage() {
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const continueTarget = resolveContinueTarget(searchParams.get('redirect'));

  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [role, setRole] = useState<Role>(DEFAULT_ROLE);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shownTracked = useRef(false);

  useEffect(() => {
    if (!isAdmin || shownTracked.current) return;
    shownTracked.current = true;
    trackEvent({
      event: 'onboarding_invite_shown',
      category: 'Onboarding',
      action: 'InviteShown',
      label: null,
      value: null,
    });
  }, [isAdmin]);

  // Inviting needs the Project Admin role; anyone else just continues.
  if (!isAdmin) {
    return <Navigate to={continueTarget} replace />;
  }

  /**
   * Moves valid addresses from `text` into the list. Returns the list as it will be after
   * the update, or null when something in `text` isn't a valid email (it stays in the input).
   */
  const commitDraft = (text: string): string[] | null => {
    const candidates = splitEmailInput(text);
    const invalid = candidates.filter(candidate => !isValidEmail(candidate));
    const next = [...emails];
    for (const candidate of candidates) {
      if (isValidEmail(candidate) && !next.includes(candidate)) next.push(candidate);
    }
    if (next.length > MAX_INVITE_EMAILS) {
      setError(`You can invite up to ${String(MAX_INVITE_EMAILS)} people at once.`);
      return null;
    }
    setEmails(next);
    setDraft(invalid.join(' '));
    if (invalid.length > 0) {
      setError(`"${invalid[0]}" is not a valid email address.`);
      return null;
    }
    setError(null);
    return next;
  };

  const removeEmail = (email: string) => {
    setEmails(prev => prev.filter(item => item !== email));
    setError(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',' || event.key === ';') {
      event.preventDefault();
      if (draft.trim()) commitDraft(draft);
      return;
    }
    if (event.key === 'Backspace' && !draft && emails.length > 0) {
      setEmails(prev => prev.slice(0, -1));
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text');
    if (splitEmailInput(pasted).length < 2) return;
    event.preventDefault();
    commitDraft(`${draft} ${pasted}`);
  };

  const continueToApp = () => {
    void navigate(continueTarget, { replace: true });
  };

  const handleSkip = () => {
    // Null label/value: GTM would otherwise forward the role and count of an earlier send.
    trackEvent({
      event: 'onboarding_invite_skipped',
      category: 'Onboarding',
      action: 'Skip',
      label: null,
      value: null,
    });
    continueToApp();
  };

  const handleSend = async () => {
    const recipients = draft.trim() ? commitDraft(draft) : emails;
    if (!recipients) return;
    if (recipients.length === 0) {
      setError('Enter at least one email address.');
      return;
    }

    setSending(true);
    setError(null);
    const invited: string[] = [];
    const failed: { email: string; message: string }[] = [];
    // One at a time: each invite is a call to the identity provider, and a batch of
    // parallel calls for a fresh project gains nothing but upstream rate-limit risk.
    for (const email of recipients) {
      try {
        await projectMembersService.inviteMember({
          email,
          role,
          roleScope: role === 'admin' ? undefined : 'entire_project',
        });
        invited.push(email);
      } catch (caught) {
        // The server's own sentence when it wrote one (e.g. already a member). A 5xx carries
        // none: the API client's toast reports it with the request id, so no raw Axios text here.
        const serverMessage = extractApiError(caught).message?.trim() ?? '';
        failed.push({
          email,
          message: serverMessage.length > 0 ? serverMessage : 'Failed to send invitation',
        });
      }
    }
    setSending(false);

    if (invited.length > 0) {
      trackEvent({
        event: 'onboarding_invite_sent',
        category: 'Onboarding',
        action: 'InviteSent',
        label: role,
        value: String(invited.length),
      });
      toast.success(
        invited.length === 1
          ? `Invitation sent to ${invited[0]}`
          : `Invitations sent to ${String(invited.length)} teammates`
      );
    }

    if (failed.length === 0) {
      continueToApp();
      return;
    }
    // Keep only the addresses that failed, so a retry doesn't re-invite the others.
    setEmails(failed.map(item => item.email));
    setError(
      failed.length === 1
        ? `Couldn't invite ${failed[0].email}: ${failed[0].message}`
        : `Couldn't invite ${String(failed.length)} people. Check the addresses and try again.`
    );
  };

  const pendingCount = emails.length + (draft.trim() ? 1 : 0);
  const sendLabel = emails.length > 1 ? `Send ${String(emails.length)} invites` : 'Send invite';

  return (
    <div className='w-full max-w-xl py-8 text-center'>
      <h1 className='text-2xl font-semibold tracking-tight sm:text-3xl'>{COPY.title}</h1>
      <p className='text-muted-foreground mx-auto mt-3 max-w-md text-sm sm:text-base'>
        {COPY.subtitle}
      </p>

      <form
        className='mt-8 text-left'
        onSubmit={event => {
          event.preventDefault();
          void handleSend();
        }}
      >
        <div className='flex flex-col gap-2 sm:flex-row sm:items-start'>
          <div className='border-input focus-within:ring-ring/50 focus-within:border-ring bg-background flex min-h-9 flex-1 flex-wrap items-center gap-1.5 rounded-md border px-2 py-1 shadow-xs focus-within:ring-[3px]'>
            {emails.map(email => (
              <span
                key={email}
                className='bg-muted text-foreground inline-flex max-w-full items-center gap-1 rounded px-2 py-0.5 text-sm'
              >
                <span className='truncate'>{email}</span>
                <button
                  type='button'
                  onClick={() => {
                    removeEmail(email);
                  }}
                  disabled={sending}
                  className='text-muted-foreground hover:text-foreground'
                  aria-label={`Remove ${email}`}
                >
                  <X className='h-3.5 w-3.5' />
                </button>
              </span>
            ))}
            <input
              type='email'
              value={draft}
              onChange={event => {
                setDraft(event.target.value);
                if (error) setError(null);
              }}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onBlur={() => {
                if (draft.trim()) commitDraft(draft);
              }}
              placeholder={emails.length === 0 ? 'teammate@company.com' : ''}
              aria-label='Teammate email'
              aria-invalid={error ? true : undefined}
              disabled={sending}
              autoFocus
              className='placeholder:text-muted-foreground min-w-40 flex-1 bg-transparent py-1 text-sm outline-none'
            />
          </div>
          <InviteRolePicker value={role} onChange={setRole} disabled={sending} />
        </div>

        {error ? (
          <p className='text-destructive mt-2 text-sm' role='alert'>
            {error}
          </p>
        ) : (
          <p className='text-muted-foreground mt-2 flex items-center justify-center gap-1.5 text-sm'>
            Press
            <kbd className='bg-muted inline-flex h-6 items-center rounded px-1.5'>
              <CornerDownLeft className='h-3.5 w-3.5' aria-label='Enter' />
            </kbd>
            {COPY.hint}
          </p>
        )}

        <div className='mt-8 flex flex-col items-center gap-3'>
          <Button type='submit' size='lg' disabled={sending || pendingCount === 0}>
            {sending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {sendLabel}
          </Button>
          <Button type='button' variant='ghost' onClick={handleSkip} disabled={sending}>
            Skip for now
          </Button>
        </div>
      </form>
    </div>
  );
}
