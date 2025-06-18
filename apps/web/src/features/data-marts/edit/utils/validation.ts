import { z } from 'zod';
import { DataStorageType } from '../../../data-storage';

/**
 * Schema for validating data mart creation/update
 */
export const dataMartSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title must be less than 100 characters'),
  storageType: z.nativeEnum(DataStorageType, {
    errorMap: () => ({ message: 'Please select a valid storage type' }),
  }),
});

/**
 * Type for validated data mart input
 */
export type ValidatedDataMartInput = z.infer<typeof dataMartSchema>;

/**
 * Validates data mart input data
 * @param data Data to validate
 * @returns Validation result with data or errors
 */
export function validateDataMartInput(data: unknown) {
  try {
    const validatedData = dataMartSchema.parse(data);
    return { success: true, data: validatedData, errors: null };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors: Record<string, string> = {};
      error.errors.forEach(err => {
        if (err.path[0]) {
          formattedErrors[err.path[0].toString()] = err.message;
        }
      });
      return { success: false, data: null, errors: formattedErrors };
    }

    return {
      success: false,
      data: null,
      errors: { _form: 'Validation failed' },
    };
  }
}
