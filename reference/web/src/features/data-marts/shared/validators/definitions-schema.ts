import { z } from 'zod';
import { DataStorageType } from '../../../data-storage';
import {
  isValidFullyQualifiedName,
  getFullyQualifiedNameError,
  isValidTablePattern,
  getTablePatternError,
} from '../utils';

/**
 * Creates a Zod schema for validating fully qualified name fields in table and view definitions
 * @param storageType - The data storage type configuration
 * @returns A Zod schema for validation
 */
export const createFullyQualifiedNameSchema = (storageType: DataStorageType) => {
  return z.object({
    fullyQualifiedName: z
      .string()
      .min(1, 'Fully qualified name is required')
      .refine(
        value => isValidFullyQualifiedName(value, storageType),
        value => ({
          message: getFullyQualifiedNameError(value, storageType),
        })
      ),
  });
};

/**
 * Creates a Zod schema for validating table pattern fields
 * @param storageType - The data storage type configuration
 * @returns A Zod schema for validation
 */
export const createTablePatternSchema = (storageType: DataStorageType) => {
  return z.object({
    pattern: z
      .string()
      .min(1, 'Table pattern is required')
      .refine(
        value => isValidTablePattern(value, storageType),
        value => ({
          message: getTablePatternError(value, storageType),
        })
      ),
  });
};
