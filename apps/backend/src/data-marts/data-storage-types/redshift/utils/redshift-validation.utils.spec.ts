import {
  isValidRedshiftFullyQualifiedName,
  isValidRedshiftTablePattern,
} from './redshift-validation.utils';
import {
  describeFullyQualifiedNameValidator,
  describeTablePatternValidator,
} from '../../utils/validation.utils.spec';

const BASE_CONFIG = { allowedChars: 'a-zA-Z0-9_', allowTwoLevel: true, allowQuotedSegments: true };

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

    it('should return true for production CONNECTOR formats with quoted identifiers', () => {
      expect(
        isValidRedshiftFullyQualifiedName('"ads_owox"."facebook_ads_ad_account_insights"')
      ).toBe(true);
      expect(
        isValidRedshiftFullyQualifiedName('"bank_of_canada_owox"."bank_of_canada_exchange_rates"')
      ).toBe(true);
      expect(isValidRedshiftFullyQualifiedName('"shopify_owox_2026"."shopify_orders"')).toBe(true);
    });
  }
);

describeTablePatternValidator('Redshift', BASE_CONFIG, isValidRedshiftTablePattern);
