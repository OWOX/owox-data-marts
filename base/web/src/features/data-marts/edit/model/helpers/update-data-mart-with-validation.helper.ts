// Helper function to update data mart with validation information
import type { DataMart } from '../types';
import { validateDataMartForPublishing } from '../../../shared';

export const updateDataMartWithValidationHelper = (dataMart: DataMart): DataMart => {
  const validationErrors = validateDataMartForPublishing(dataMart);
  return {
    ...dataMart,
    canPublish: validationErrors.length === 0,
    validationErrors,
  };
};
