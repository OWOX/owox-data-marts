import toast from 'react-hot-toast';

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

/** Same dedicated close button the app's persistent API-error toasts use
 * (see shared/utils/showApiErrorToast.ts) — text stays selectable, dismissal is explicit. */
// eslint-disable-next-line react-refresh/only-export-components -- toast content, not a route component
function DismissButton({ toastId, label }: { toastId: string; label: string }) {
  return (
    <button
      type='button'
      aria-label={label}
      onClick={() => {
        toast.dismiss(toastId);
      }}
      style={{
        cursor: 'pointer',
        background: 'none',
        border: 'none',
        padding: 0,
        margin: 0,
        font: 'inherit',
        color: 'inherit',
        flexShrink: 0,
      }}
    >
      ✕
    </button>
  );
}

/**
 * Persistent (no auto-dismiss) error toast for AI helper failures, rendered through the
 * same react-hot-toast error style the rest of the app uses (red, top-center) — a
 * transient toast proved invisible in practice: the presenter on the 2026-08-05 client
 * demo never saw the failure and retried blindly. Keyed per data mart so retries
 * collapse onto one toast.
 *
 * The technical details expand by re-issuing the toast under the same id rather than via
 * a native `<details>` element, so the toast re-renders and re-measures its height.
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

  toast.error(
    t => (
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>
          {message}
          {details &&
            (detailsExpanded ? (
              <span
                style={{
                  display: 'block',
                  marginTop: '0.25rem',
                  fontSize: '0.75rem',
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                  opacity: 0.85,
                }}
              >
                {details}
              </span>
            ) : (
              <button
                type='button'
                onClick={() => {
                  renderErrorToast(dataMartId, humanized, true);
                }}
                style={{
                  display: 'block',
                  marginTop: '0.25rem',
                  cursor: 'pointer',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  font: 'inherit',
                  fontSize: '0.75rem',
                  color: 'inherit',
                  textDecoration: 'underline',
                  opacity: 0.85,
                }}
              >
                Show technical details
              </button>
            ))}
        </span>
        <DismissButton toastId={t.id} label='Dismiss error' />
      </span>
    ),
    { duration: Infinity, id: `ai-helper-error-${dataMartId}` }
  );
}

/**
 * Clears this data mart's persistent AI helper toasts. Called when a new run starts:
 * a user who fixed the permission and retries must not keep seeing the old error, and
 * a stale cancellation notice is obsolete the moment a fresh attempt begins.
 */
export function dismissAiHelperToasts(dataMartId: string): void {
  toast.dismiss(`ai-helper-error-${dataMartId}`);
  toast.dismiss(`ai-helper-cancelled-${dataMartId}`);
}

/**
 * Leaving the page aborts an in-flight generation; without this notice the user comes
 * back to untouched fields with no explanation of whether the run succeeded.
 */
export function showAiHelperCancelledToast(dataMartId: string): void {
  toast(
    t => (
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>
          AI suggestion generation was cancelled because you left the page. Run it again when you
          are ready.
        </span>
        <DismissButton toastId={t.id} label='Dismiss notice' />
      </span>
    ),
    { duration: Infinity, id: `ai-helper-cancelled-${dataMartId}` }
  );
}
