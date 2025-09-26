import toast from 'react-hot-toast';
import type { ApiError } from '../../app/api/api-error.interface';
import { extractApiError } from '../../app/api/extract-api-error.util';

/**
 * Displays a formatted error toast.
 * - Always shows a fallback message if server message is missing.
 * - Appends details (if provided) in a readable way.
 * - Ensures no duplicate punctuation or empty text.
 */
export function showErrorToast(error: unknown, fallbackMessage = 'Something went wrong') {
  let apiError: ApiError;

  try {
    apiError = extractApiError(error);
  } catch {
    apiError = {
      message: error instanceof Error ? error.message : fallbackMessage,
      path: '',
      statusCode: 500,
      timestamp: new Date().toISOString(),
    };
  }

  // Ensure we always have a base message
  let message = apiError.message.trim() || fallbackMessage;

  // Append details if present
  if (apiError.details?.trim()) {
    message = `${message}. ${apiError.details}`;
  }

  // Show toast
  toast.error(message);
}
