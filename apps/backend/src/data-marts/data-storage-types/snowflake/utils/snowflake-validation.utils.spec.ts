import {
  isValidSnowflakeFullyQualifiedName,
  isValidSnowflakeTablePattern,
} from './snowflake-validation.utils';
import {
  describeFullyQualifiedNameValidator,
  describeTablePatternValidator,
} from '../../utils/validation.utils.spec';

const BASE_CONFIG = {
  allowedChars: 'a-zA-Z0-9_$',
  allowTwoLevel: false,
  allowQuotedSegments: true,
};

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

    it('should return true for production CONNECTOR formats with quoted identifiers', () => {
      expect(
        isValidSnowflakeFullyQualifiedName('ads_owox."PUBLIC"."google_ads_ad_group_ads_stats"')
      ).toBe(true);
      expect(
        isValidSnowflakeFullyQualifiedName(
          'facebook_ads_owox."PUBLIC"."facebook_ads_ad_account_insights"'
        )
      ).toBe(true);
      expect(
        isValidSnowflakeFullyQualifiedName('shopify_owox_2026."PUBLIC"."shopify_orders"')
      ).toBe(true);
    });
  }
);

describeTablePatternValidator('Snowflake', BASE_CONFIG, isValidSnowflakeTablePattern, () => {
  it('should return true for patterns with dollar signs', () => {
    expect(isValidSnowflakeTablePattern('db.$schema.$table_*')).toBe(true);
  });
});
