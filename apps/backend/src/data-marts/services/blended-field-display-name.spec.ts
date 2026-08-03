import { formatBlendedFieldDisplayName } from './blended-field-display-name';

describe('formatBlendedFieldDisplayName', () => {
  it('uses the same prefix and alias convention as report headers', () => {
    expect(
      formatBlendedFieldDisplayName({
        name: 'customers__id',
        outputPrefix: 'Customers',
        alias: 'Customer ID',
        originalFieldName: 'id',
      })
    ).toBe('Customers Customer ID');
  });

  it('falls back from alias to the original and technical field names', () => {
    expect(
      formatBlendedFieldDisplayName({
        name: 'customers__id',
        outputPrefix: 'Customers',
        alias: '',
        originalFieldName: 'id',
      })
    ).toBe('Customers id');
    expect(formatBlendedFieldDisplayName({ name: 'customers__id' })).toBe('customers__id');
  });
});
