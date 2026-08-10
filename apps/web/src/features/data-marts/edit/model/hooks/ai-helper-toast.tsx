import { toast } from 'sonner';

/**
 * BigQuery access errors arrive as raw API strings like
 * "Access Denied: Project prj-x: User does not have bigquery.datasets.create permission
 * in project prj-x." — actionable for an admin, cryptic for the person on the demo call.
 */
const BIGQUERY_PERMISSION_RE =
  /User does not have ([\w.]+) permission in project ([\w.:-]+?)\.?$/im;
const BIGQUERY_ACCESS_DENIED_RE = /Access Denied: Project ([\w.:-]+):/i;

export interface HumanizedAiHelperError {
  message: string;
  /** Present only when `message` is a rewrite — holds the raw error for support. */
  details?: string;
}

/**
 * Maps known error classes to a human-readable message; anything unrecognized
 * passes through unchanged so the user still sees the real backend text.
 */
export function humanizeAiHelperError(raw: string): HumanizedAiHelperError {
  const permissionMatch = BIGQUERY_PERMISSION_RE.exec(raw);
  if (permissionMatch) {
    const [, permission, project] = permissionMatch;
    return {
      message: `OWOX can't access BigQuery project "${project}": the connected user lacks the ${permission} permission. Ask a BigQuery admin to grant it, then try again.`,
      details: raw,
    };
  }

  const accessDeniedMatch = BIGQUERY_ACCESS_DENIED_RE.exec(raw);
  if (accessDeniedMatch) {
    return {
      message: `OWOX can't access BigQuery project "${accessDeniedMatch[1]}" with the connected credentials. Check the storage permissions, then try again.`,
      details: raw,
    };
  }

  return { message: raw };
}

/** Mirrors the app's error-toast palette (see shared/components/Toaster) so AI helper
 * failures read as errors, not neutral cards. */
const ERROR_TOAST_STYLE: React.CSSProperties = {
  background: '#FEE2E2',
  color: '#991B1B',
  border: '1px solid #EAD1D1',
};

/**
 * Persistent (no auto-dismiss) error toast for AI helper failures. A transient toast
 * proved invisible in practice — the presenter on the 2026-08-05 client demo never saw
 * the failure and retried blindly. Keyed per data mart so retries collapse onto one toast.
 *
 * The technical details expand by re-issuing the toast (same id) rather than via a native
 * `<details>` element: sonner measures the card height when the toast renders, so content
 * that grows without a re-render overflows the card.
 */
export function showAiHelperErrorToast(dataMartId: string, rawMessage: string): void {
  renderErrorToast(dataMartId, humanizeAiHelperError(rawMessage), false);
}

function renderErrorToast(
  dataMartId: string,
  humanized: HumanizedAiHelperError,
  detailsExpanded: boolean
): void {
  const { message, details } = humanized;

  toast.error(message, {
    id: `ai-helper-error-${dataMartId}`,
    duration: Infinity,
    closeButton: true,
    style: ERROR_TOAST_STYLE,
    description: details ? (
      detailsExpanded ? (
        <div className='mt-1 text-xs break-words whitespace-pre-wrap opacity-80'>{details}</div>
      ) : (
        <button
          type='button'
          className='mt-1 cursor-pointer text-xs underline underline-offset-2 opacity-80'
          onClick={() => renderErrorToast(dataMartId, humanized, true)}
        >
          Show technical details
        </button>
      )
    ) : undefined,
  });
}

/**
 * Leaving the page aborts an in-flight generation; without this notice the user comes
 * back to untouched fields with no explanation of whether the run succeeded.
 */
export function showAiHelperCancelledToast(dataMartId: string): void {
  toast.info(
    'AI suggestion generation was cancelled because you left the page. Run it again when you are ready.',
    {
      id: `ai-helper-cancelled-${dataMartId}`,
      duration: Infinity,
      closeButton: true,
    }
  );
}
