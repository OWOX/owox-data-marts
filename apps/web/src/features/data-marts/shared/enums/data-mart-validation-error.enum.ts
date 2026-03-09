/**
 * Data mart validation error enum
 */
export enum DataMartValidationError {
  ALREADY_PUBLISHED = 'ALREADY_PUBLISHED',
  INVALID_STORAGE = 'INVALID_STORAGE',
  MISSING_DEFINITION = 'MISSING_DEFINITION',
}

/**
 * Data mart validation error messages
 */
export const DATA_MART_VALIDATION_ERROR_MESSAGES: Record<DataMartValidationError, string> = {
  [DataMartValidationError.ALREADY_PUBLISHED]: 'Data mart is already published',
  [DataMartValidationError.INVALID_STORAGE]: 'Data mart must have a valid storage',
  [DataMartValidationError.MISSING_DEFINITION]: 'Data Mart must have an input source configured',
};

/**
 * Data mart required setup actions
 */
export const DATA_MART_REQUIRED_ACTIONS: Record<DataMartValidationError, string> = {
  [DataMartValidationError.ALREADY_PUBLISHED]: 'Data Mart is already published',
  [DataMartValidationError.INVALID_STORAGE]: 'complete storage configuration',
  [DataMartValidationError.MISSING_DEFINITION]: 'configure an input source',
};
