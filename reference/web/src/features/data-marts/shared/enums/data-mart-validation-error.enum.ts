/**
 * Data mart validation error enum
 */
export enum DataMartValidationError {
  ALREADY_PUBLISHED = 'ALREADY_PUBLISHED',
  INVALID_STORAGE = 'INVALID_STORAGE',
  MISSING_DEFINITION_TYPE = 'MISSING_DEFINITION_TYPE',
  MISSING_DEFINITION = 'MISSING_DEFINITION',
}

/**
 * Data mart validation error messages
 */
export const DATA_MART_VALIDATION_ERROR_MESSAGES: Record<DataMartValidationError, string> = {
  [DataMartValidationError.ALREADY_PUBLISHED]: 'Data mart is already published',
  [DataMartValidationError.INVALID_STORAGE]: 'Data mart must have a valid storage',
  [DataMartValidationError.MISSING_DEFINITION_TYPE]:
    'Data mart must have an input source configured',
  [DataMartValidationError.MISSING_DEFINITION]: 'Data mart must have a valid definition',
};
