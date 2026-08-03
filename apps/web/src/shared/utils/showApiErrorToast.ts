import toast from 'react-hot-toast';
import { createElement } from 'react';
import type { ApiError, ApiValidationError } from '../../app/api/api-error.interface';
import { extractApiError } from '../../app/api/extract-api-error.util';

/** How many validator errors one toast shows before summarising the rest. */
const MAX_LISTED_VALIDATION_ERRORS = 3;

/**
 * `AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_FIELD` → `Aggregation function not allowed for field`.
 *
 * A generic transform rather than a per-code table: the codes are stable and self-describing, so
 * this reads as a sentence for every one of them — including codes added after this shipped —
 * whereas a lookup table silently falls back to the raw enum for anything it has not been taught.
 */
function humanizeValidationCode(code: string): string {
  const words = code.toLowerCase().replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Renders the validator's structured errors as one readable sentence. Prefers the backend's own
 * `message` (written for a human, and the only place recovery advice lives); otherwise names the
 * rule that rejected it and the column it rejected, since a bare code is not actionable.
 *
 * Capped: the validator reports EVERY problem in one array, so a badly configured report could
 * push a wall of text into a toast that stays until dismissed. The first few name the problem;
 * the count tells the user there is more to fix.
 */
function formatValidationErrors(errors: ApiValidationError[] | undefined): string | null {
  // Shape-checked, not just length-checked: this runs inside an error handler, and a body whose
  // `details.errors` is a string (or anything else array-like) would throw on `.map` — turning a
  // reportable failure into an unhandled one.
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const parts = errors
    .map(e => {
      const text = e.message?.trim();
      if (text) return text;
      if (!e.code) return null;
      const column = e.column ?? e.label;
      const target = e.function && column ? `${e.function}(${column})` : column;
      const rule = humanizeValidationCode(e.code);
      return target ? `${rule}: ${target}.` : `${rule}.`;
    })
    .filter((part): part is string => Boolean(part));
  // De-duplicate: several rules can fail for the same reason and repeating it is noise.
  const unique = [...new Set(parts)];
  if (unique.length === 0) return null;
  if (unique.length <= MAX_LISTED_VALIDATION_ERRORS) return unique.join(' ');
  const hidden = unique.length - MAX_LISTED_VALIDATION_ERRORS;
  return `${unique.slice(0, MAX_LISTED_VALIDATION_ERRORS).join(' ')} (+${hidden} more)`;
}

/**
 * Displays a formatted error toast.
 * - Always shows a fallback message if server message is missing.
 * - Appends details (if provided) in a readable way.
 */
export function showApiErrorToast(
  error: unknown,
  fallbackMessage = 'Something went wrong',
  options?: { persistent?: boolean; id?: string }
) {
  const apiError = extractApiError(error) as ApiError | undefined;

  // Ensure we always have a base message (empty server messages fall back too)
  let message = apiError?.message?.trim() ?? fallbackMessage;
  if (message.length === 0) message = fallbackMessage;

  // Append details if present
  const errorDetails = apiError?.errorDetails?.error?.trim();
  if (errorDetails) {
    message = `${message}. ${errorDetails}`;
  }

  // The output-controls validator uses a different envelope (`details.errors`) than
  // BusinessViolation (`errorDetails.error`). It was dropped entirely, so a rejected report
  // showed only "Output controls validation failed" — no column, no reason, nothing to act on.
  const validationDetails = formatValidationErrors(apiError?.details?.errors);
  if (validationDetails) {
    message = `${message}. ${validationDetails}`;
  }

  // Persistent toasts stay until the user dismisses them. A stable id keeps
  // repeated identical errors from stacking. The message text stays selectable
  // (users may want to copy the required role), so dismissal is a dedicated,
  // keyboard-accessible close button instead of the whole message.
  if (options?.persistent) {
    toast.error(
      t =>
        createElement(
          'span',
          { style: { display: 'flex', alignItems: 'center', gap: '0.5rem' } },
          message,
          createElement(
            'button',
            {
              type: 'button',
              'aria-label': 'Dismiss error',
              onClick: () => {
                toast.dismiss(t.id);
              },
              style: {
                cursor: 'pointer',
                background: 'none',
                border: 'none',
                padding: 0,
                margin: 0,
                font: 'inherit',
                color: 'inherit',
                flexShrink: 0,
              },
            },
            '✕'
          )
        ),
      { duration: Infinity, id: `persistent-error:${message}` }
    );
    return;
  }

  if (options?.id) {
    toast.error(message, { id: options.id });
    return;
  }

  toast.error(message);
}
