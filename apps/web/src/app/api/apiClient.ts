import axios, {
  type AxiosInstance,
  type AxiosRequestConfig as OriginalAxiosRequestConfig,
  AxiosError,
} from 'axios';
import toast from 'react-hot-toast';
import type { ApiError } from './api-error.interface.ts';

// Extend AxiosRequestConfig to include our custom properties
export interface AxiosRequestConfig extends OriginalAxiosRequestConfig {
  skipLoadingIndicator?: boolean;
}

// Default config for the axios instance
const axiosConfig: AxiosRequestConfig = {
  // Base URL for API requests
  baseURL: import.meta.env.VITE_PUBLIC_API_URL || '/api',

  // Request timeout in milliseconds
  timeout: 30000,

  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
};

const apiClient: AxiosInstance = axios.create(axiosConfig);

apiClient.interceptors.response.use(
  response => response,
  (error: AxiosError) => {
    if (error.response && error.response.status === 400) {
      const data = error.response.data as ApiError;

      toast.error(data.message);
    }

    return Promise.reject(error);
  }
);

export default apiClient;
