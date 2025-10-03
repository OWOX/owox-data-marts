import toast from 'react-hot-toast';
import type { ApiError } from '../../app/api/api-error.interface';
import { extractApiError } from '../../app/api/extract-api-error.util';

/**
 * Displays a formatted error toast.
 * - Always shows a fallback message if server message is missing.
 * - Appends details (if provided) in a readable way.
 */
export function showApiErrorToast(error: unknown, fallbackMessage = 'Something went wrong') {
  const apiError: ApiError = extractApiError(error);

  // Ensure we always have a base message
  let message = apiError.message.trim() || fallbackMessage;

  // Append details if present
  if (apiError.errorDetails?.error?.trim()) {
    message = `${message}. ${apiError.errorDetails.error}`;
  }

  // Show toast
  toast.error(message);
}
