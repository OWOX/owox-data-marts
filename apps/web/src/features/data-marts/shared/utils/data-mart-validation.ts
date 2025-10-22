import {
  DataMartStatus,
  DataMartValidationError,
  DATA_MART_VALIDATION_ERROR_MESSAGES,
} from '../enums';
import type { DataMart } from '../../edit';
import { isDataStorageConfigValid } from '../../../data-storage';

/**
 * Validate a data mart before publishing
 * @param dataMart - The data mart to validate
 * @returns Array of validation error codes
 */
export const validateDataMartForPublishing = (dataMart: DataMart): DataMartValidationError[] => {
  const errors: DataMartValidationError[] = [];

  // Check if data mart is already published
  if (dataMart.status.code === DataMartStatus.PUBLISHED) {
    errors.push(DataMartValidationError.ALREADY_PUBLISHED);
  }

  // Check if the storage configuration is set
  if (!isDataStorageConfigValid(dataMart.storage)) {
    errors.push(DataMartValidationError.INVALID_STORAGE);
  }

  // Check if the definition is set
  if (!dataMart.definition) {
    errors.push(DataMartValidationError.MISSING_DEFINITION);
  }

  return errors;
};

/**
 * Get validation error messages from error codes
 * @param errors - Array of validation error codes
 * @returns Array of validation error messages
 */
export const getValidationErrorMessages = (errors: DataMartValidationError[]): string[] => {
  return errors.map(error => DATA_MART_VALIDATION_ERROR_MESSAGES[error]);
};

/**
 * Check if a data mart can be published
 * @param dataMart - The data mart to check
 * @returns Whether the data mart can be published
 */
export const canPublishDataMart = (dataMart: DataMart): boolean => {
  const errors = validateDataMartForPublishing(dataMart);
  return errors.length === 0;
};
