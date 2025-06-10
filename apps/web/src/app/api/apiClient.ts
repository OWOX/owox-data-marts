import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';

// Default config for the axios instance
const axiosConfig = {
  // Base URL for API requests
  baseURL: import.meta.env.VITE_PUBLIC_API_URL || '/api',

  // Request timeout in milliseconds
  timeout: 15000,

  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
};

const apiClient = axios.create(axiosConfig);

export default apiClient;
