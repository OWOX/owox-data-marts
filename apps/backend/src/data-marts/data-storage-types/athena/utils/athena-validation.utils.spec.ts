import {
  isValidAthenaConnectorTableName,
  isValidAthenaFullyQualifiedName,
  isValidAthenaTablePattern,
} from './athena-validation.utils';
import {
  describeFullyQualifiedNameValidator,
  describeTablePatternValidator,
} from '../../utils/validation.utils.spec';

const BASE_CONFIG = { allowedChars: 'a-zA-Z0-9_\\-', allowTwoLevel: true };

describeFullyQualifiedNameValidator('Athena', BASE_CONFIG, isValidAthenaFullyQualifiedName, () => {
  it('should return true for names with hyphens', () => {
    expect(isValidAthenaFullyQualifiedName('database-1.table-1')).toBe(true);
    expect(isValidAthenaFullyQualifiedName('catalog-1.database-1.table-1')).toBe(true);
  });

  it('should return false for names with dollar signs', () => {
    expect(isValidAthenaFullyQualifiedName('database.table$')).toBe(false);
  });
});

describeTablePatternValidator('Athena', BASE_CONFIG, isValidAthenaTablePattern);

describe('isValidAthenaConnectorTableName', () => {
  it('accepts database.table', () => {
    expect(isValidAthenaConnectorTableName('database-1.table_1')).toBe(true);
  });

  it('rejects a catalog part, because the connector reads the first part as the database', () => {
    expect(isValidAthenaConnectorTableName('AwsDataCatalog.database.table')).toBe(false);
  });

  it('rejects malformed names', () => {
    expect(isValidAthenaConnectorTableName('')).toBe(false);
    expect(isValidAthenaConnectorTableName('table')).toBe(false);
    expect(isValidAthenaConnectorTableName('database.table$')).toBe(false);
  });
});
