import {
  collectKnownNativeOutputColumns,
  collectKnownOutputColumns,
  withoutUnknownSortColumns,
} from './known-output-columns.util';

describe('known-output-columns.util', () => {
  const nativeFields = [
    { name: 'country', type: 'STRING' },
    { name: 'hidden_col', type: 'STRING', isHiddenForReporting: true },
    { name: 'gone_col', type: 'STRING', status: 'DISCONNECTED' },
    { name: 'user', type: 'RECORD', fields: [{ name: 'email', type: 'STRING' }] },
    // A formula is never returned by the warehouse; a warehouse-derived status says nothing.
    {
      name: 'ctr',
      type: 'FLOAT',
      status: 'DISCONNECTED',
      calculated: { formula: '1', level: 'column' },
    },
  ] as never;

  describe('collectKnownNativeOutputColumns', () => {
    it('keeps connected paths and calculated fields, prunes hidden and disconnected ones, adds the Unique Count label', () => {
      expect([...collectKnownNativeOutputColumns(nativeFields)]).toEqual([
        'country',
        'user',
        'user.email',
        'ctr',
        'Unique Count',
      ]);
    });
  });

  describe('collectKnownOutputColumns', () => {
    it('adds non-hidden blended fields and one Unique Count name per offered joined source', () => {
      const known = collectKnownOutputColumns({
        nativeFields,
        blendedFields: [
          { name: 'orders__status', isHidden: false },
          { name: 'orders__secret', isHidden: true },
        ],
        availableSources: [{ aliasPath: 'orders' }, { aliasPath: 'orders.items' }],
      } as never);

      expect(known.has('country')).toBe(true);
      expect(known.has('orders__status')).toBe(true);
      expect(known.has('orders__secret')).toBe(false);
      expect(known.has('Unique Count')).toBe(true);
      expect(known.has('orders__unique_count')).toBe(true);
      expect(known.has('orders_items__unique_count')).toBe(true);
    });
  });

  describe('withoutUnknownSortColumns', () => {
    it('keeps the rules the schema resolves, in order, and names each dropped column once', () => {
      const { kept, dropped } = withoutUnknownSortColumns(
        [
          { column: 'ghost', direction: 'desc' },
          { column: 'country', direction: 'asc' },
          { column: 'ghost', direction: 'asc' },
          { column: 'user.email', direction: 'desc' },
        ],
        new Set(['country', 'user.email'])
      );

      expect(kept).toEqual([
        { column: 'country', direction: 'asc' },
        { column: 'user.email', direction: 'desc' },
      ]);
      expect(dropped).toEqual(['ghost']);
    });

    it('returns every rule untouched when all of them resolve', () => {
      const sort = [{ column: 'country', direction: 'asc' as const }];
      expect(withoutUnknownSortColumns(sort, new Set(['country']))).toEqual({
        kept: sort,
        dropped: [],
      });
    });
  });
});
