export interface StorageOAuthRefreshError {
  code?: string;
  message?: string;
}

const STORAGE_OAUTH_REFRESH_ERROR_CODES = new Set(['TOKEN_REFRESH_FAILED', 'CREDENTIALS_EXPIRED']);

export function isStorageOAuthRefreshError(error: StorageOAuthRefreshError): boolean {
  if (error.code && STORAGE_OAUTH_REFRESH_ERROR_CODES.has(error.code)) {
    return true;
  }

  const message = error.message ?? '';
  return (
    message.includes('Failed to refresh OAuth tokens') ||
    message.includes('Google authorization could not be refreshed') ||
    message.includes('Google access could not be refreshed')
  );
}
