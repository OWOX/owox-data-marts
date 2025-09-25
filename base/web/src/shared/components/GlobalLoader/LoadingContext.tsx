import { useState, useEffect, type ReactNode } from 'react';
import apiClient, { type AxiosRequestConfig } from '../../../app/api/apiClient';
import { type InternalAxiosRequestConfig, type AxiosResponse, AxiosError } from 'axios';
import { LoadingContext } from './context';

interface LoadingProviderProps {
  children: ReactNode;
}

export function LoadingProvider({ children }: LoadingProviderProps) {
  const [pendingRequests, setPendingRequests] = useState<number>(0);
  const isLoading = pendingRequests > 0;

  useEffect(() => {
    // Add request interceptor
    const requestInterceptor = apiClient.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        // Only increment the counter if skipLoadingIndicator is not true
        if (!(config as unknown as AxiosRequestConfig).skipLoadingIndicator) {
          setPendingRequests(prev => prev + 1);
        }
        return config;
      },
      (error: AxiosError) => {
        // Only decrement if the request would have incremented
        if (!(error.config as unknown as AxiosRequestConfig).skipLoadingIndicator) {
          setPendingRequests(prev => Math.max(0, prev - 1));
        }
        return Promise.reject(error);
      }
    );

    // Add response interceptor
    const responseInterceptor = apiClient.interceptors.response.use(
      (response: AxiosResponse) => {
        // Only decrement if the request would have incremented
        if (!(response.config as unknown as AxiosRequestConfig).skipLoadingIndicator) {
          setPendingRequests(prev => Math.max(0, prev - 1));
        }
        return response;
      },
      (error: AxiosError) => {
        // Only decrement if the request would have incremented
        if (!(error.config as unknown as AxiosRequestConfig).skipLoadingIndicator) {
          setPendingRequests(prev => Math.max(0, prev - 1));
        }
        return Promise.reject(error);
      }
    );

    // Clean up interceptors when component unmounts
    return () => {
      apiClient.interceptors.request.eject(requestInterceptor);
      apiClient.interceptors.response.eject(responseInterceptor);
    };
  }, []);

  return <LoadingContext.Provider value={{ isLoading }}>{children}</LoadingContext.Provider>;
}
