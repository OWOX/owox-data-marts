import { describe, expect, it } from 'vitest';
import {
  canPublishDataMart,
  getValidationErrorMessages,
  validateDataMartForPublishing,
} from './data-mart-validation';
import {
  DATA_MART_VALIDATION_ERROR_MESSAGES,
  DataMartDefinitionType,
  DataMartStatus,
  DataMartValidationError,
} from '../enums';
import type { DataMart } from '../../edit';
import { DataStorageType } from '../../../data-storage';

describe('data-mart-validation', () => {
  // Mock data
  const createMockDataMart = (overrides?: Partial<DataMart>): DataMart => ({
    id: 'test-id',
    title: 'Test Data Mart',
    description: 'Test description',
    status: {
      code: DataMartStatus.DRAFT,
      displayName: 'Draft',
      description: 'Data mart is in draft mode and not yet published',
    },
    storage: {
      id: 'storage-id',
      title: 'Test Storage',
      type: DataStorageType.GOOGLE_BIGQUERY,
      createdAt: new Date(),
      modifiedAt: new Date(),
      config: {
        projectId: 'project-id',
        location: 'EU',
      },
      credentials: {
        serviceAccount: '{}',
      },
    },
    definitionType: DataMartDefinitionType.SQL,
    definition: { sqlQuery: 'SELECT * FROM table' },
    canPublish: true,
    validationErrors: [],
    createdAt: new Date(),
    modifiedAt: new Date(),
    ...overrides,
  });

  describe('validateDataMartForPublishing', () => {
    it('should return no errors for a valid data mart', () => {
      const dataMart = createMockDataMart();
      const errors = validateDataMartForPublishing(dataMart);
      expect(errors).toEqual([]);
    });

    it('should return ALREADY_PUBLISHED error when data mart is already published', () => {
      const dataMart = createMockDataMart({
        status: {
          code: DataMartStatus.PUBLISHED,
          displayName: 'Published',
          description: 'Data mart is published and available for use',
        },
      });
      const errors = validateDataMartForPublishing(dataMart);
      expect(errors).toContain(DataMartValidationError.ALREADY_PUBLISHED);
    });

    it('should return MISSING_DEFINITION_TYPE error when definitionType is null', () => {
      const dataMart = createMockDataMart({ definitionType: null });
      const errors = validateDataMartForPublishing(dataMart);
      expect(errors).toContain(DataMartValidationError.MISSING_DEFINITION_TYPE);
    });

    it('should return MISSING_DEFINITION error when definition is null', () => {
      const dataMart = createMockDataMart({ definition: null });
      const errors = validateDataMartForPublishing(dataMart);
      expect(errors).toContain(DataMartValidationError.MISSING_DEFINITION);
    });

    it('should return multiple errors when multiple conditions are not met', () => {
      const dataMart = createMockDataMart({
        definitionType: null,
        definition: null,
      });
      const errors = validateDataMartForPublishing(dataMart);
      expect(errors).toContain(DataMartValidationError.MISSING_DEFINITION_TYPE);
      expect(errors).toContain(DataMartValidationError.MISSING_DEFINITION);
      expect(errors.length).toBe(2);
    });
  });

  describe('getValidationErrorMessages', () => {
    it('should return empty array for empty errors array', () => {
      const messages = getValidationErrorMessages([]);
      expect(messages).toEqual([]);
    });

    it('should return correct error messages for given error codes', () => {
      const errors = [
        DataMartValidationError.ALREADY_PUBLISHED,
        DataMartValidationError.MISSING_DEFINITION,
      ];
      const messages = getValidationErrorMessages(errors);
      expect(messages).toEqual([
        DATA_MART_VALIDATION_ERROR_MESSAGES[DataMartValidationError.ALREADY_PUBLISHED],
        DATA_MART_VALIDATION_ERROR_MESSAGES[DataMartValidationError.MISSING_DEFINITION],
      ]);
    });
  });

  describe('canPublishDataMart', () => {
    it('should return true when data mart has no validation errors', () => {
      const dataMart = createMockDataMart();
      const canPublish = canPublishDataMart(dataMart);
      expect(canPublish).toBe(true);
    });

    it('should return false when data mart has validation errors', () => {
      const dataMart = createMockDataMart({
        status: {
          code: DataMartStatus.PUBLISHED,
          displayName: 'Published',
          description: 'Data mart is published and available for use',
        },
      });
      const canPublish = canPublishDataMart(dataMart);
      expect(canPublish).toBe(false);
    });
  });
});
