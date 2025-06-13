/* eslint-disable */
import { mockDataStorages } from './mockDataStorage';
import type { DataStorageListResponseDto, DataStorageResponseDto } from '../types';

// Simulate network delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Mock implementation of the data storage API service
export const mockDataStorageApiService = {
  getDataStorages: async (): Promise<DataStorageListResponseDto> => {
    // Simulate network delay (500-1500ms)
    await delay(Math.random() * 1000 + 500);

    // Return mock data
    return [...mockDataStorages];
  },

  getDataStorageById: async (id: string): Promise<DataStorageResponseDto> => {
    await delay(Math.random() * 800 + 400);

    const storage = mockDataStorages.find(storage => storage.id === id);

    if (!storage) {
      throw new Error(`Data storage with ID ${id} not found`);
    }

    return { ...storage };
  },

  createDataStorage: async (data: any): Promise<DataStorageResponseDto> => {
    await delay(Math.random() * 1200 + 800);

    // In a real implementation, this would be saved to the server
    // For mock purposes, we're just returning the new object
    return {
      id: `new-${Date.now()}`,
      type: data.type,
      title: data.title,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      credentials: data.credentials || {},
      config: data.config || {},
    };
  },

  deleteDataStorage: async (id: string): Promise<void> => {
    await delay(Math.random() * 600 + 400);

    const storageIndex = mockDataStorages.findIndex(storage => storage.id === id);

    if (storageIndex === -1) {
      throw new Error(`Data storage with ID ${id} not found`);
    }

    // In a real implementation, this would delete the item on the server
    // For now, we just simulate a successful deletion
    return;
  },
};
