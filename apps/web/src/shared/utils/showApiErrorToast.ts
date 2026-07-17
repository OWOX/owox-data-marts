import toast from 'react-hot-toast';
import { createElement } from 'react';
import type { ApiError } from '../../app/api/api-error.interface';
import { extractApiError } from '../../app/api/extract-api-error.util';

/**
 * Displays a formatted error toast.
 * - Always shows a fallback message if server message is missing.
 * - Appends details (if provided) in a readable way.
 */
export function showApiErrorToast(
  error: unknown,
  fallbackMessage = 'Something went wrong',
  options?: { persistent?: boolean }
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
              'aria-label': 'Dismiss',
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

  toast.error(message);
}
