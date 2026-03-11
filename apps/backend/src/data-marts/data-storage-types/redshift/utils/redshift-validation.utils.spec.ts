import {
  isValidRedshiftFullyQualifiedName,
  isValidRedshiftTablePattern,
} from './redshift-validation.utils';
import {
  describeFullyQualifiedNameValidator,
  describeTablePatternValidator,
} from '../../utils/validation.utils.spec';

const BASE_CONFIG = { allowedChars: 'a-zA-Z0-9_', allowTwoLevel: true };

describeFullyQualifiedNameValidator(
  'Redshift',
  BASE_CONFIG,
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

describeTablePatternValidator('Redshift', BASE_CONFIG, isValidRedshiftTablePattern);
