import { useState, useCallback } from 'react';
import { z } from 'zod';
import type { CreateDataMartRequestDto, UpdateDataMartRequestDto } from '../../../../shared';
import { useDataMartContext } from '../context';

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
    async (data: CreateDataMartRequestDto) => {
      if (validateForm(data as unknown as Record<string, unknown>)) {
        await createDataMart(data);
        return true;
      }
      return false;
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
