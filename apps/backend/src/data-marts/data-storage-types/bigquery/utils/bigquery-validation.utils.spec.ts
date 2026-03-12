import {
  isValidBigQueryFullyQualifiedName,
  isValidBigQueryTablePattern,
} from './bigquery-validation.utils';
import {
  describeFullyQualifiedNameValidator,
  describeTablePatternValidator,
} from '../../utils/validation.utils.spec';

const BASE_CONFIG = { allowedChars: 'a-zA-Z0-9_\\-', allowTwoLevel: false };

describeFullyQualifiedNameValidator(
  'BigQuery',
  BASE_CONFIG,
  isValidBigQueryFullyQualifiedName,
  () => {
    it('should return true for names with hyphens', () => {
      expect(isValidBigQueryFullyQualifiedName('my-project.my-dataset.my_table')).toBe(true);
    });

    it('should return false for names with dollar signs', () => {
      expect(isValidBigQueryFullyQualifiedName('project.dataset.table$')).toBe(false);
    });
  }
);

const CONNECTOR_CONFIG = { allowedChars: 'a-zA-Z0-9_\\-', allowTwoLevel: true };

describeFullyQualifiedNameValidator(
  'BigQueryConnector',
  CONNECTOR_CONFIG,
  value => isValidBigQueryFullyQualifiedName(value, { allowTwoLevel: true }),
  () => {
    it('should return true for names with hyphens', () => {
      expect(
        isValidBigQueryFullyQualifiedName('my-dataset.my_table', { allowTwoLevel: true })
      ).toBe(true);
      expect(
        isValidBigQueryFullyQualifiedName('my-project.my-dataset.my_table', { allowTwoLevel: true })
      ).toBe(true);
    });
  }
);

describeTablePatternValidator('BigQuery', BASE_CONFIG, isValidBigQueryTablePattern, () => {
  it('should return true for patterns with hyphens', () => {
    expect(isValidBigQueryTablePattern('my-project.my-dataset.table_*')).toBe(true);
  });

  it('should return false for patterns with dollar signs', () => {
    expect(isValidBigQueryTablePattern('project.dataset.table*$')).toBe(false);
  });
});
