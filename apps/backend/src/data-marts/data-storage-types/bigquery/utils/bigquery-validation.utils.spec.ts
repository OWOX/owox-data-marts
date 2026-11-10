import {
  isValidBigQueryConnectorTableName,
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

describe('isValidBigQueryConnectorTableName', () => {
  it('accepts dataset.table', () => {
    expect(isValidBigQueryConnectorTableName('owox_ads.facebook_ads')).toBe(true);
    expect(isValidBigQueryConnectorTableName('my_dataset.my-table')).toBe(true);
  });

  it('rejects a project part, because the connector reads the first part as the dataset', () => {
    expect(isValidBigQueryConnectorTableName('my-project.owox_ads.facebook_ads')).toBe(false);
  });

  it('rejects a dataset name that BigQuery does not accept', () => {
    expect(isValidBigQueryConnectorTableName('my-dataset.my_table')).toBe(false);
  });

  it('rejects malformed names', () => {
    expect(isValidBigQueryConnectorTableName('')).toBe(false);
    expect(isValidBigQueryConnectorTableName('table')).toBe(false);
    expect(isValidBigQueryConnectorTableName('dataset.')).toBe(false);
    expect(isValidBigQueryConnectorTableName('dataset.table; DROP')).toBe(false);
    expect(isValidBigQueryConnectorTableName('`dataset`.`table`')).toBe(false);
  });
});

describeTablePatternValidator('BigQuery', BASE_CONFIG, isValidBigQueryTablePattern, () => {
  it('should return true for patterns with hyphens', () => {
    expect(isValidBigQueryTablePattern('my-project.my-dataset.table_*')).toBe(true);
  });

  it('should return false for patterns with dollar signs', () => {
    expect(isValidBigQueryTablePattern('project.dataset.table*$')).toBe(false);
  });
});
