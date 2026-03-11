import {
  isValidBigQueryFullyQualifiedName,
  isValidBigQueryTablePattern,
  BIGQUERY_VALIDATION_CONFIG,
} from './bigquery-validation.utils';
import {
  describeFullyQualifiedNameValidator,
  describeTablePatternValidator,
} from '../../utils/validation.utils.spec';

describeFullyQualifiedNameValidator(
  'BigQuery',
  BIGQUERY_VALIDATION_CONFIG,
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

describeTablePatternValidator(
  'BigQuery',
  BIGQUERY_VALIDATION_CONFIG,
  isValidBigQueryTablePattern,
  () => {
    it('should return true for patterns with hyphens', () => {
      expect(isValidBigQueryTablePattern('my-project.my-dataset.table_*')).toBe(true);
    });

    it('should return false for patterns with dollar signs', () => {
      expect(isValidBigQueryTablePattern('project.dataset.table*$')).toBe(false);
    });
  }
);
