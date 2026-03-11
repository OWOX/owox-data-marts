import {
  isValidRedshiftFullyQualifiedName,
  isValidRedshiftTablePattern,
  REDSHIFT_VALIDATION_CONFIG,
} from './redshift-validation.utils';
import {
  describeFullyQualifiedNameValidator,
  describeTablePatternValidator,
} from '../../utils/validation.utils.spec';

describeFullyQualifiedNameValidator(
  'Redshift',
  REDSHIFT_VALIDATION_CONFIG,
  isValidRedshiftFullyQualifiedName,
  () => {
    it('should return false for names with hyphens (not allowed in unquoted Redshift identifiers)', () => {
      expect(isValidRedshiftFullyQualifiedName('schema-1.table-1')).toBe(false);
      expect(isValidRedshiftFullyQualifiedName('db-1.schema-1.table-1')).toBe(false);
      expect(isValidRedshiftFullyQualifiedName('my-schema.my-table')).toBe(false);
    });

    it('should return false for SQL injection attempts with comments', () => {
      expect(isValidRedshiftFullyQualifiedName('schema.table--')).toBe(false);
      expect(isValidRedshiftFullyQualifiedName('schema.table/*comment*/')).toBe(false);
    });
  }
);

describeTablePatternValidator('Redshift', REDSHIFT_VALIDATION_CONFIG, isValidRedshiftTablePattern);
