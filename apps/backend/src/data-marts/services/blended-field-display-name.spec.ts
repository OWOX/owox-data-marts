import { formatBlendedFieldDisplayName } from './blended-field-display-name';

describe('formatBlendedFieldDisplayName', () => {
  describe('prefix style (default)', () => {
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

    it('is what an explicit prefix style produces too', () => {
      expect(
        formatBlendedFieldDisplayName(
          { name: 'customers__id', outputPrefix: 'Customers', originalFieldName: 'id' },
          'prefix'
        )
      ).toBe('Customers id');
    });
  });

  describe('suffix style', () => {
    it('puts the data mart name after the field name, in parentheses', () => {
      expect(
        formatBlendedFieldDisplayName(
          {
            name: 'customers__id',
            outputPrefix: 'Customers',
            alias: 'Customer ID',
            originalFieldName: 'id',
          },
          'suffix'
        )
      ).toBe('Customer ID (Customers)');
    });

    it('falls back from alias to the original and technical field names', () => {
      expect(
        formatBlendedFieldDisplayName(
          {
            name: 'customers__id',
            outputPrefix: 'Customers',
            alias: '',
            originalFieldName: 'id',
          },
          'suffix'
        )
      ).toBe('id (Customers)');
      expect(formatBlendedFieldDisplayName({ name: 'customers__id' }, 'suffix')).toBe(
        'customers__id'
      );
    });

    it('keeps a nested struct path intact in the field part', () => {
      expect(
        formatBlendedFieldDisplayName(
          {
            name: 'orders__metrics_revenue',
            outputPrefix: 'Orders',
            originalFieldName: 'metrics.revenue',
          },
          'suffix'
        )
      ).toBe('metrics.revenue (Orders)');
    });
  });

  describe.each(['prefix', 'suffix'] as const)('blank output prefix (%s style)', style => {
    it('renders the bare field name when the data mart name is empty', () => {
      expect(
        formatBlendedFieldDisplayName(
          { name: 'customers__id', outputPrefix: '', originalFieldName: 'id' },
          style
        )
      ).toBe('id');
    });

    it('renders the bare field name when the data mart name is whitespace only', () => {
      expect(
        formatBlendedFieldDisplayName(
          { name: 'customers__id', outputPrefix: '   ', originalFieldName: 'id' },
          style
        )
      ).toBe('id');
    });
  });

  // Both halves are free-form user input and are stored as typed — `z.string().min(1)` accepts
  // `"  "`, and neither the form nor the schema trims. Padding on either side must not reach the
  // label, or a Google Sheets header reads `Revenue  (Orders)` with a doubled space.
  describe.each(['prefix', 'suffix'] as const)('padded field name (%s style)', style => {
    it('strips padding around the field alias', () => {
      expect(
        formatBlendedFieldDisplayName(
          {
            name: 'orders__revenue',
            outputPrefix: 'Orders',
            alias: '  Revenue  ',
            originalFieldName: 'revenue',
          },
          style
        )
      ).toBe(style === 'suffix' ? 'Revenue (Orders)' : 'Orders Revenue');
    });

    it('falls through to the original field name when the alias is whitespace only', () => {
      // Otherwise the label degrades to `   (Orders)` — a column that looks unnamed.
      expect(
        formatBlendedFieldDisplayName(
          {
            name: 'orders__revenue',
            outputPrefix: 'Orders',
            alias: '   ',
            originalFieldName: 'revenue',
          },
          style
        )
      ).toBe(style === 'suffix' ? 'revenue (Orders)' : 'Orders revenue');
    });

    it('falls through to the technical name when both the alias and the original are blank', () => {
      expect(
        formatBlendedFieldDisplayName(
          {
            name: 'orders__revenue',
            outputPrefix: 'Orders',
            alias: '  ',
            originalFieldName: ' ',
          },
          style
        )
      ).toBe(style === 'suffix' ? 'orders__revenue (Orders)' : 'Orders orders__revenue');
    });
  });
});
