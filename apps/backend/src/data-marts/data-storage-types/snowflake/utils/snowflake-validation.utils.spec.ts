import {
  isValidSnowflakeFullyQualifiedName,
  isValidSnowflakeTablePattern,
  SNOWFLAKE_VALIDATION_CONFIG,
} from './snowflake-validation.utils';
import {
  describeFullyQualifiedNameValidator,
  describeTablePatternValidator,
} from '../../utils/validation.utils.spec';

<<<<<<< Updated upstream
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
=======
const BASE_CONFIG = { allowedChars: 'a-zA-Z0-9_$', allowTwoLevel: false };

describeFullyQualifiedNameValidator(
  'Snowflake',
  BASE_CONFIG,
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
  },
);

describeTablePatternValidator(
  'Snowflake',
  BASE_CONFIG,
>>>>>>> Stashed changes
  isValidSnowflakeTablePattern,
  () => {
    it('should return true for patterns with dollar signs', () => {
      expect(isValidSnowflakeTablePattern('db.$schema.$table_*')).toBe(true);
    });
<<<<<<< Updated upstream
  }
=======
  },
>>>>>>> Stashed changes
);
