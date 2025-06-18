import { useCallback, useState } from 'react';
import { z } from 'zod';
import { useDataMartContext } from '../context';
import type { DataMart } from '../types';
import type { CreateDataMartRequestDto, UpdateDataMartRequestDto } from '../../../shared/types/api';

// Validation schema
const dataMartSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title must be less than 100 characters'),
  storage: z.string().min(1, 'Storage type is required'),
});

/**
 * Hook for managing data mart form state and operations
 */
export function useDataMartForm() {
  const { createDataMart, updateDataMart, isLoading, error } = useDataMartContext();
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Function to validate form data
  const validateForm = useCallback((data: Record<string, unknown>) => {
    try {
      dataMartSchema.parse(data);
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formattedErrors: Record<string, string> = {};
        error.errors.forEach(err => {
          if (err.path[0]) {
            formattedErrors[err.path[0].toString()] = err.message;
          }
        });
        setErrors(formattedErrors);
      }
      return false;
    }
  }, []);

  // Function to handle create submission
  const handleCreate = useCallback(
    async (data: CreateDataMartRequestDto): Promise<Pick<DataMart, 'id' | 'title'> | null> => {
      if (validateForm(data as unknown as Record<string, unknown>)) {
        return await createDataMart(data);
      }
      return null;
    },
    [createDataMart, validateForm]
  );

  // Function to handle update submission
  const handleUpdate = useCallback(
    async (id: string, data: UpdateDataMartRequestDto) => {
      if (validateForm(data as Record<string, unknown>)) {
        await updateDataMart(id, data);
        return true;
      }
      return false;
    },
    [updateDataMart, validateForm]
  );

  return {
    handleCreate,
    handleUpdate,
    errors,
    isSubmitting: isLoading,
    serverError: error,
  };
}
