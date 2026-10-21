import { countDataMartRelationships } from './count-data-mart-relationships';

const rel = (sourceDataMartId: string, targetDataMartId: string) => ({
  sourceDataMartId,
  targetDataMartId,
});

describe('countDataMartRelationships', () => {
  it('counts the relationships a Data Mart defines and the ones that point to it', () => {
    const counts = countDataMartRelationships(
      [rel('orders', 'customers'), rel('sessions', 'orders'), rel('orders', 'products')],
      ['orders', 'customers', 'products', 'sessions']
    );

    expect(counts).toEqual(
      new Map([
        ['orders', 3],
        ['customers', 1],
        ['sessions', 1],
        ['products', 1],
      ])
    );
  });

  it('counts a relationship to itself once and every alias between one pair separately', () => {
    const counts = countDataMartRelationships(
      [rel('orders', 'orders'), rel('orders', 'customers'), rel('orders', 'customers')],
      ['orders', 'customers']
    );

    expect(counts.get('orders')).toBe(3);
    expect(counts.get('customers')).toBe(2);
  });

  it('counts only the given Data Marts and leaves out the ones without relationships', () => {
    const counts = countDataMartRelationships([rel('orders', 'customers')], ['orders', 'products']);

    expect(counts).toEqual(new Map([['orders', 1]]));
  });
});
