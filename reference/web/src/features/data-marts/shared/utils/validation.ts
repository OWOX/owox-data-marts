/**
 * Utility functions for validating data mart definitions based on storage type
 */
import { DataStorageType } from '../../../data-storage';
import {
  isValidBigQueryFullyQualifiedName,
  isValidBigQueryTablePattern,
  getBigQueryFullyQualifiedNameError,
  getBigQueryTablePatternError,
} from './bigquery-validation';
import {
  isValidAthenaFullyQualifiedName,
  isValidAthenaTablePattern,
  getAthenaFullyQualifiedNameError,
  getAthenaTablePatternError,
} from './athena-validation';

/**
 * Validates if a string matches the fully qualified name pattern for the given storage type
 * @param value - The string to validate
 * @param storageType - The data storage type configuration
 * @returns Boolean indicating if the string is valid
 */
export const isValidFullyQualifiedName = (value: string, storageType: DataStorageType): boolean => {
  if (!value) return false;

  switch (storageType) {
    case DataStorageType.GOOGLE_BIGQUERY:
      return isValidBigQueryFullyQualifiedName(value);
    case DataStorageType.AWS_ATHENA:
      return isValidAthenaFullyQualifiedName(value);
    default:
      return false;
  }
};

/**
 * Validates if a string matches the table pattern format for the given storage type
 * @param value - The string to validate
 * @param storageType - The data storage type configuration
 * @returns Boolean indicating if the string is valid
 */
export const isValidTablePattern = (value: string, storageType: DataStorageType): boolean => {
  if (!value) return false;

  switch (storageType) {
    case DataStorageType.GOOGLE_BIGQUERY:
      return isValidBigQueryTablePattern(value);
    case DataStorageType.AWS_ATHENA:
      return isValidAthenaTablePattern(value);
    default:
      return false;
  }
};

/**
 * Returns a validation error message for fully qualified name based on storage type
 * @param value - The string to validate
 * @param storageType - The data storage configuration
 * @returns Error message or empty string if valid
 */
export const getFullyQualifiedNameError = (value: string, storageType: DataStorageType): string => {
  if (!value) return 'Fully qualified name is required';

  switch (storageType) {
    case DataStorageType.GOOGLE_BIGQUERY:
      return getBigQueryFullyQualifiedNameError(value);
    case DataStorageType.AWS_ATHENA:
      return getAthenaFullyQualifiedNameError(value);
    default:
      return 'Unsupported storage type';
  }
};

/**
 * Returns a validation error message for a table pattern based on storage type
 * @param value - The string to validate
 * @param storageType - The data storage type configuration
 * @returns Error message or empty string if valid
 */
export const getTablePatternError = (value: string, storageType: DataStorageType): string => {
  if (!value) return 'Table pattern is required';

  switch (storageType) {
    case DataStorageType.GOOGLE_BIGQUERY:
      return getBigQueryTablePatternError(value);
    case DataStorageType.AWS_ATHENA:
      return getAthenaTablePatternError(value);
    default:
      return 'Unsupported storage type';
  }
};

/**
 * Returns the placeholder text for fully qualified name based on storage type
 * @param storageType - The data storage type configuration
 * @returns Placeholder text
 */
export const getFullyQualifiedNamePlaceholder = (storageType: DataStorageType): string => {
  switch (storageType) {
    case DataStorageType.GOOGLE_BIGQUERY:
      return 'project.dataset.table';
    case DataStorageType.AWS_ATHENA:
      return 'database.table or catalog.database.table';
    default:
      return '';
  }
};

/**
 * Returns the placeholder text for a table pattern based on storage type
 * @param storageType - The data storage type configuration
 * @returns Placeholder text
 */
export const getTablePatternPlaceholder = (storageType: DataStorageType): string => {
  switch (storageType) {
    case DataStorageType.GOOGLE_BIGQUERY:
      return 'project.dataset.table_*';
    case DataStorageType.AWS_ATHENA:
      return 'database.table_* or catalog.database.table_*';
    default:
      return '';
  }
};

/**
 * Returns the help text for fully qualified name based on storage type
 * @param storageType - The data storage configuration
 * @returns Help text
 */
export const getFullyQualifiedNameHelpText = (storageType: DataStorageType): string => {
  switch (storageType) {
    case DataStorageType.GOOGLE_BIGQUERY:
      return 'Enter the fully qualified name of the table (e.g., project.dataset.table)';
    case DataStorageType.AWS_ATHENA:
      return 'Enter the fully qualified name of the table (e.g., database.table or catalog.database.table)';
    default:
      return '';
  }
};

/**
 * Returns the help text for a table pattern based on storage type
 * @param storageType - The data storage type configuration
 * @returns Help text
 */
export const getTablePatternHelpText = (storageType: DataStorageType): string => {
  switch (storageType) {
    case DataStorageType.GOOGLE_BIGQUERY:
      return 'Enter a pattern to match multiple tables (e.g., project.dataset.table_* will match all tables starting with "table_")';
    case DataStorageType.AWS_ATHENA:
      return 'Enter a pattern to match multiple tables (e.g., database.table_* will match all tables starting with "table_")';
    default:
      return '';
  }
};
