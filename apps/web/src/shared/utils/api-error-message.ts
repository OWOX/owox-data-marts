/** Reads the backend's message from an axios error, falling back to the raw Error message. */
export function apiErrorMessage(error: unknown): string | undefined {
  const message = (error as { response?: { data?: { message?: unknown } } } | undefined)?.response
    ?.data?.message;

  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.filter(item => typeof item === 'string').join('. ');

  return error instanceof Error ? error.message : undefined;
}
