import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { CornerDownLeft, Loader2, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button } from '@owox/ui/components/button';
import { extractApiError } from '../../app/api';
import { useFlags } from '../../app/store/hooks';
import { useIsAdmin } from '../../features/idp';
import { RedirectStorageService } from '../../features/idp/services/redirect-storage.service';
import { storedRedirectTarget } from '../../features/idp/utils/post-auth-redirect';
import { projectMembersService } from '../../features/project-members/services/project-members.service';
import type { Role } from '../../features/project-members/types';
import { checkVisible } from '../../utils/check-visible';
import { trackEvent } from '../../utils/data-layer';
import { InviteRolePicker } from './InviteRolePicker';
import {
  MAX_INVITE_EMAILS,
  isValidEmail,
  resolveContinueTarget,
  splitEmailInput,
} from './invite-teammates.utils';

const COPY = {
  title: 'Invite your colleague',
  subtitle:
    'Bring in a teammate who helps set up the project (e.g. connect your data warehouse, create Data Marts).',
  hint: 'to add as many people as you need',
};

const DEFAULT_ROLE: Role = 'editor';
const ERROR_ID = 'invite-teammates-error';

interface InviteFailure {
  email: string;
  message: string;
}

/** The server's sentence for a failed invite (e.g. already a member), or a plain fallback. */
function describeInviteFailure(caught: unknown): string {
  const apiError = extractApiError(caught);
  const message = apiError.message?.trim() ?? '';
  if (message.length > 0) return message;
  // A 5xx has no message; its request id is the only handle support has on the server log.
  return apiError.requestId
    ? `Something went wrong on our side. Request id: ${apiError.requestId}`
    : 'Failed to send invitation';
}

/** Analytics keys GTM would otherwise carry over from an earlier push (it keeps the last value). */
const CLEARED_EVENT_KEYS = { label: null, value: null, context: null };

/**
 * First-run step shown once, right after the sign-up questionnaire: the new project's only
 * admin invites the teammates who will set the project up. Sending or skipping continues to
 * the deep link the user opened before signing up, or else to `?redirect=`.
 *
 * Only the OWOX sign-up questionnaire links here, and that IDP emails the invitation itself.
 * Under any other IDP (which may answer with a one-time link to share) the step is skipped.
 */
export function InviteTeammatesPage() {
  const isAdmin = useIsAdmin();
  const { flags } = useFlags();
  const isOwoxIdp = checkVisible('IDP_PROVIDER', ['owox-better-auth'], flags);
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [searchParams] = useSearchParams();

  // A deep link kept by the sign-in flow (e.g. a plugin link opened before signing up) wins
  // over `?redirect=`: the post-auth redirect leaves it to this step (see AuthContext).
  const [storedTarget] = useState(() => {
    const stored = RedirectStorageService.retrieve();
    if (!stored || !projectId) return null;
    return storedRedirectTarget({
      storedRedirect: stored,
      currentUrl: window.location.pathname + window.location.search,
      projectId,
    });
  });
  const continueTarget = resolveContinueTarget(storedTarget ?? searchParams.get('redirect'));
  const canInvite = isAdmin && isOwoxIdp;

  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [role, setRole] = useState<Role>(DEFAULT_ROLE);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failures, setFailures] = useState<InviteFailure[]>([]);
  const [invitedCount, setInvitedCount] = useState(0);
  const shownTracked = useRef(false);

  useEffect(() => {
    RedirectStorageService.clear();
  }, []);

  useEffect(() => {
    if (!canInvite || shownTracked.current) return;
    shownTracked.current = true;
    trackEvent({
      event: 'onboarding_invite_shown',
      category: 'Onboarding',
      action: 'InviteShown',
      ...CLEARED_EVENT_KEYS,
    });
  }, [canInvite]);

  // Inviting needs the Project Admin role and the OWOX IDP; otherwise just continue.
  if (!canInvite) {
    return <Navigate to={continueTarget} replace />;
  }

  const clearMessages = () => {
    setError(null);
    setFailures([]);
    setInvitedCount(0);
  };

  /**
   * Moves valid addresses from `text` into the list. Returns the list as it will be after
   * the update, or null when `text` can't be taken as is (it then stays in the input).
   */
  const commitDraft = (text: string): string[] | null => {
    const candidates = splitEmailInput(text);
    const invalid = candidates.filter(candidate => !isValidEmail(candidate));
    const next = [...emails];
    for (const candidate of candidates) {
      if (isValidEmail(candidate) && !next.includes(candidate)) next.push(candidate);
    }
    clearMessages();
    if (next.length > MAX_INVITE_EMAILS) {
      setDraft(text.trim());
      setError(`You can invite up to ${String(MAX_INVITE_EMAILS)} people at once.`);
      return null;
    }
    setEmails(next);
    setDraft(invalid.join(' '));
    if (invalid.length > 0) {
      setError(`"${invalid[0]}" is not a valid email address.`);
      return null;
    }
    return next;
  };

  const removeEmail = (email: string) => {
    setEmails(prev => prev.filter(item => item !== email));
    clearMessages();
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
    // Keep what was typed around the cursor; the selection is replaced, as a paste would.
    const input = event.currentTarget;
    const start = input.selectionStart ?? draft.length;
    const end = input.selectionEnd ?? draft.length;
    commitDraft(`${draft.slice(0, start)} ${pasted} ${draft.slice(end)}`);
  };

  const continueToApp = () => {
    void navigate(continueTarget, { replace: true });
  };

  const handleSkip = () => {
    trackEvent({
      event: 'onboarding_invite_skipped',
      category: 'Onboarding',
      action: 'Skip',
      ...CLEARED_EVENT_KEYS,
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
    clearMessages();
    const invited: string[] = [];
    const failed: InviteFailure[] = [];
    // One at a time: each invite is a call to the identity provider, and a batch of
    // parallel calls for a fresh project gains nothing but upstream rate-limit risk.
    for (const email of recipients) {
      try {
        // Silent: every failure is listed below the input, so no toast per address.
        await projectMembersService.inviteMember(
          { email, role, roleScope: role === 'admin' ? undefined : 'entire_project' },
          { silent: true }
        );
        invited.push(email);
      } catch (caught) {
        failed.push({ email, message: describeInviteFailure(caught) });
      }
    }
    setSending(false);

    if (invited.length > 0) {
      trackEvent({
        event: 'onboarding_invite_sent',
        category: 'Onboarding',
        action: 'InviteSent',
        ...CLEARED_EVENT_KEYS,
        label: role,
        value: String(invited.length),
      });
    }

    if (failed.length === 0) {
      // Shown by the app's toaster on the page this step continues to.
      toast.success(
        invited.length === 1
          ? `Invitation sent to ${invited[0]}`
          : `Invitations sent to ${String(invited.length)} teammates`
      );
      continueToApp();
      return;
    }
    // Keep only the addresses that failed, so a retry doesn't re-invite the others.
    setEmails(failed.map(item => item.email));
    setFailures(failed);
    setInvitedCount(invited.length);
  };

  // The label counts only addresses that will be sent; a typo in the input doesn't add one.
  const sendCount =
    emails.length +
    splitEmailInput(draft).filter(email => isValidEmail(email) && !emails.includes(email)).length;
  const sendLabel = sendCount > 1 ? `Send ${String(sendCount)} invites` : 'Send invite';
  const hasInput = emails.length > 0 || draft.trim().length > 0;
  const hasMessage = Boolean(error) || failures.length > 0;

  return (
    <div className='w-full max-w-xl py-8 text-center'>
      <h1 className='text-2xl font-semibold tracking-tight sm:text-3xl'>{COPY.title}</h1>
      <p className='text-muted-foreground mx-auto mt-3 max-w-md text-sm sm:text-base'>
        {COPY.subtitle}
      </p>

      {/* noValidate: the page validates each address itself, so no browser bubble. */}
      <form
        noValidate
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
            {/* type=text: an email input rejects a typed or pasted list and trims the value. */}
            <input
              type='text'
              inputMode='email'
              autoComplete='off'
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
              aria-invalid={hasMessage ? true : undefined}
              aria-describedby={hasMessage ? ERROR_ID : undefined}
              disabled={sending}
              autoFocus
              className='placeholder:text-muted-foreground min-w-40 flex-1 bg-transparent py-1 text-sm outline-none'
            />
          </div>
          <InviteRolePicker value={role} onChange={setRole} disabled={sending} />
        </div>

        {hasMessage ? (
          <div id={ERROR_ID} className='text-destructive mt-2 text-sm' role='alert'>
            {error && <p>{error}</p>}
            {failures.length > 0 && (
              <>
                <p>
                  {invitedCount > 0 &&
                    `Sent ${String(invitedCount)} ${invitedCount === 1 ? 'invitation' : 'invitations'}. `}
                  {`Couldn't invite:`}
                </p>
                <ul className='mt-1 list-disc pl-5'>
                  {failures.map(failure => (
                    <li key={failure.email}>
                      {failure.email}: {failure.message}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
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
          <Button type='submit' size='lg' disabled={sending || !hasInput}>
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
