import {
  isValidDatabricksFullyQualifiedName,
  isValidDatabricksTablePattern,
  DATABRICKS_VALIDATION_CONFIG,
} from './databricks-validation.utils';
import {
  describeFullyQualifiedNameValidator,
  describeTablePatternValidator,
} from '../../utils/validation.utils.spec';

<<<<<<< Updated upstream
describeFullyQualifiedNameValidator(
  'Databricks',
  DATABRICKS_VALIDATION_CONFIG,
  isValidDatabricksFullyQualifiedName,
  () => {
    it('should return false for names with hyphens', () => {
      expect(isValidDatabricksFullyQualifiedName('catalog.schema.table-')).toBe(false);
    });

    it('should return false for names with dollar signs', () => {
      expect(isValidDatabricksFullyQualifiedName('catalog.schema.table$')).toBe(false);
    });

    it('should return false for SQL injection attempts with comments', () => {
      expect(isValidDatabricksFullyQualifiedName('catalog.schema.table--')).toBe(false);
      expect(isValidDatabricksFullyQualifiedName('catalog.schema.table/*comment*/')).toBe(false);
    });
  }
);

describeTablePatternValidator(
  'Databricks',
  DATABRICKS_VALIDATION_CONFIG,
  isValidDatabricksTablePattern
=======
const BASE_CONFIG = { allowedChars: 'a-zA-Z0-9_', allowTwoLevel: false };

describeFullyQualifiedNameValidator(
  'Databricks',
  BASE_CONFIG,
  isValidDatabricksFullyQualifiedName,
  () => {
    it('should return false for names with hyphens', () => {
      expect(isValidDatabricksFullyQualifiedName('catalog.schema.table-')).toBe(false);
    });

    it('should return false for names with dollar signs', () => {
      expect(isValidDatabricksFullyQualifiedName('catalog.schema.table$')).toBe(false);
    });

    it('should return false for SQL injection attempts with comments', () => {
      expect(isValidDatabricksFullyQualifiedName('catalog.schema.table--')).toBe(false);
      expect(isValidDatabricksFullyQualifiedName('catalog.schema.table/*comment*/')).toBe(false);
    });
  },
);

describeTablePatternValidator(
  'Databricks',
  BASE_CONFIG,
  isValidDatabricksTablePattern,
>>>>>>> Stashed changes
);
