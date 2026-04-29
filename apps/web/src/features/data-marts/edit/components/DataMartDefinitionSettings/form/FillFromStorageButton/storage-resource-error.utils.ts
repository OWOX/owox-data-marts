/**
 * Extracts a human-readable error message from an unknown error value.
 * Tries to read `error.response.data.message` first (axios error shape), then
 * falls back to `error.message`, and finally to a generic string.
 */
export function extractStorageResourceError(error: unknown): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  if (error instanceof Error) return error.message;
  return 'Failed to load storage resources';
}
