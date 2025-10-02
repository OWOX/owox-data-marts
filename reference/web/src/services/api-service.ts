/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import apiClient from '../app/api/apiClient.ts';
import { type AxiosRequestConfig } from 'axios';

/**
 * Generic API Service for handling common HTTP operations
 */
export class ApiService {
  /**
   * Base URL for the API endpoints
   */
  private baseUrl: string;

  /**
   * Creates a new API service instance
   * @param baseUrl Base URL for API endpoints
   */
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * Performs a GET request
   * @param endpoint API endpoint (will be appended to baseUrl)
   * @param params URL parameters
   * @param config Additional axios config
   * @returns Promise with the response data
   */
  async get<T>(endpoint: string, params?: any, config?: AxiosRequestConfig): Promise<T> {
    const url = this.createUrl(endpoint);
    const response = await apiClient.get<T>(url, { ...config, params });
    return response.data;
  }

  /**
   * Performs a POST request
   * @param endpoint API endpoint (will be appended to baseUrl)
   * @param data Request payload
   * @param config Additional axios config
   * @returns Promise with the response data
   */
  async post<T>(endpoint: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const url = this.createUrl(endpoint);
    const response = await apiClient.post<T>(url, data, config);
    return response.data;
  }

  /**
   * Performs a PUT request
   * @param endpoint API endpoint (will be appended to baseUrl)
   * @param data Request payload
   * @param config Additional axios config
   * @returns Promise with the response data
   */
  async put<T>(endpoint: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const url = this.createUrl(endpoint);
    const response = await apiClient.put<T>(url, data, config);
    return response.data;
  }

  /**
   * Performs a PATCH request
   * @param endpoint API endpoint (will be appended to baseUrl)
   * @param data Request payload
   * @param config Additional axios config
   * @returns Promise with the response data
   */
  async patch<T>(endpoint: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const url = this.createUrl(endpoint);
    const response = await apiClient.patch<T>(url, data, config);
    return response.data;
  }

  /**
   * Performs a DELETE request
   * @param endpoint API endpoint (will be appended to baseUrl)
   * @param config Additional axios config
   * @returns Promise with the response data
   */
  async delete<T = void>(endpoint: string, config?: AxiosRequestConfig): Promise<T> {
    const url = this.createUrl(endpoint);
    const response = await apiClient.delete<T>(url, config);
    return response.data;
  }

  /**
   * Creates a full URL by appending the endpoint to the base URL
   * @param endpoint API endpoint
   * @returns Full URL
   */
  private createUrl(endpoint: string): string {
    return this.baseUrl ? `${this.baseUrl}${endpoint}` : endpoint;
  }
}
