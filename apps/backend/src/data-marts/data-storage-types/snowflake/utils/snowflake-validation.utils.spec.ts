import {
  isValidSnowflakeFullyQualifiedName,
  isValidSnowflakeTablePattern,
  SNOWFLAKE_VALIDATION_CONFIG,
} from './snowflake-validation.utils';
import {
  describeFullyQualifiedNameValidator,
  describeTablePatternValidator,
} from '../../utils/validation.utils.spec';

describeFullyQualifiedNameValidator(
  'Snowflake',
  SNOWFLAKE_VALIDATION_CONFIG,
  isValidSnowflakeFullyQualifiedName,
  () => {
    it('should return true for names with dollar signs', () => {
      expect(isValidSnowflakeFullyQualifiedName('db.$schema.$table')).toBe(true);
    });

    it('should return false for names with hyphens', () => {
      expect(isValidSnowflakeFullyQualifiedName('db.schema.table-')).toBe(false);
    });

    it('should return false for SQL injection attempts with comments', () => {
      expect(isValidSnowflakeFullyQualifiedName('db.schema.table--')).toBe(false);
      expect(isValidSnowflakeFullyQualifiedName('db.schema.table/*comment*/')).toBe(false);
    });
  }
);

describeTablePatternValidator(
  'Snowflake',
  SNOWFLAKE_VALIDATION_CONFIG,
  isValidSnowflakeTablePattern,
  () => {
    it('should return true for patterns with dollar signs', () => {
      expect(isValidSnowflakeTablePattern('db.$schema.$table_*')).toBe(true);
    });
  }
);
