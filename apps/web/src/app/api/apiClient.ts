import axios, { type AxiosInstance, type AxiosRequestConfig, AxiosError } from 'axios';
import toast from 'react-hot-toast';

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
      const data = error.response.data as {
        statusCode: number;
        timestamp: string;
        path: string;
        message: string;
      };

      toast.error(data.message);
    }

    return Promise.reject(error);
  }
);

export default apiClient;
