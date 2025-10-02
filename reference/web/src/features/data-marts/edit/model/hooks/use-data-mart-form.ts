import { useCallback } from 'react';
import { z } from 'zod';
import { useDataMartContext } from '../context';
import type { DataMart } from '../types';

// Validation schema
export const dataMartSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title must be less than 100 characters'),
  storageId: z.string().min(1, 'Storage is required'),
});

export type DataMartFormData = z.infer<typeof dataMartSchema>;

/**
 * Hook for managing data mart form state and operations
 */
export function useDataMartForm() {
  const { createDataMart, isLoading, error } = useDataMartContext();

  const handleCreate = useCallback(
    async (data: DataMartFormData): Promise<Pick<DataMart, 'id' | 'title'> | null> => {
      try {
        return await createDataMart(data);
      } catch (err) {
        console.error(err);
        return null;
      }
    },
    [createDataMart]
  );

  return {
    handleCreate,
    isSubmitting: isLoading,
    serverError: error,
  };
}
