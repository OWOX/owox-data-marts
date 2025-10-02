import type { ApiError } from './api-error.interface.ts';
import type { AxiosError } from 'axios';

export const extractApiError = (error: unknown): ApiError => {
  const axiosError = error as AxiosError;
  return axiosError.response?.data as ApiError;
};
