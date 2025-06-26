import { useState, useEffect, type ReactNode } from 'react';
import apiClient from '../../../app/api/apiClient';
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
        setPendingRequests(prev => prev + 1);
        return config;
      },
      (error: AxiosError) => {
        setPendingRequests(prev => Math.max(0, prev - 1));
        return Promise.reject(error);
      }
    );

    // Add response interceptor
    const responseInterceptor = apiClient.interceptors.response.use(
      (response: AxiosResponse) => {
        setPendingRequests(prev => Math.max(0, prev - 1));
        return response;
      },
      (error: AxiosError) => {
        setPendingRequests(prev => Math.max(0, prev - 1));
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
