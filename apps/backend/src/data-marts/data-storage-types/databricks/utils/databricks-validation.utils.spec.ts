import {
  isValidDatabricksFullyQualifiedName,
  isValidDatabricksTablePattern,
} from './databricks-validation.utils';
import {
  describeFullyQualifiedNameValidator,
  describeTablePatternValidator,
} from '../../utils/validation.utils.spec';

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
  }
);

const CONNECTOR_CONFIG = { allowedChars: 'a-zA-Z0-9_', allowTwoLevel: true };

describeFullyQualifiedNameValidator(
  'DatabricksConnector',
  CONNECTOR_CONFIG,
  value => isValidDatabricksFullyQualifiedName(value, { allowTwoLevel: true }),
  () => {
    it('should return true for 2-level names (default catalog)', () => {
      expect(
        isValidDatabricksFullyQualifiedName('my_schema.my_table', { allowTwoLevel: true })
      ).toBe(true);
    });

    it('should return true for 3-level names', () => {
      expect(
        isValidDatabricksFullyQualifiedName('catalog.schema.table', { allowTwoLevel: true })
      ).toBe(true);
    });

    it('should return false for names with hyphens', () => {
      expect(
        isValidDatabricksFullyQualifiedName('schema.table-name', { allowTwoLevel: true })
      ).toBe(false);
    });
  }
);

describeTablePatternValidator('Databricks', BASE_CONFIG, isValidDatabricksTablePattern);
