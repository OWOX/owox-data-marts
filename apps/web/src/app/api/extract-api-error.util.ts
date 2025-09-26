import type { ApiError } from './api-error.interface';
import type { AxiosError } from 'axios';

interface RawApiError {
  message?: string;
  path?: string;
  statusCode?: number;
  timestamp?: string;
  errorDetails?: { error?: string };
}

function isRawApiError(obj: unknown): obj is RawApiError {
  return typeof obj === 'object' && obj !== null && ('message' in obj || 'errorDetails' in obj);
}

export const extractApiError = (error: unknown): ApiError => {
  // Base fallback error
  const fallbackMessage = error instanceof Error ? error.message : 'Unknown error occurred';

  const axiosError = error as AxiosError;

  const baseError: ApiError = {
    message: fallbackMessage,
    path: '',
    statusCode: axiosError.response?.status ?? 500,
    timestamp: new Date().toISOString(),
  };

  const data: unknown = axiosError.response?.data;

  if (isRawApiError(data)) {
    baseError.message = data.message ?? baseError.message;
    baseError.path = data.path ?? '';
    baseError.statusCode = data.statusCode ?? baseError.statusCode;
    baseError.timestamp = data.timestamp ?? baseError.timestamp;
    baseError.details = data.errorDetails?.error?.trim() ?? '';
  } else {
    console.log('data is NOT RawApiError:', data);
  }

  return baseError;
};
