import { describe, it, expect } from 'vitest';
import { fieldLeafName, fieldDisplayLabel } from './output-controls-display';

describe('fieldLeafName', () => {
  it('returns the last dotted segment', () => {
    expect(fieldLeafName('orders.order_items.products.product_id')).toBe('product_id');
  });
  it('returns the whole name when there is no dot', () => {
    expect(fieldLeafName('email')).toBe('email');
  });
});

describe('fieldDisplayLabel', () => {
  it('prefers a non-empty alias', () => {
    expect(fieldDisplayLabel('Product ID', 'orders.x.product_id')).toBe('Product ID');
  });
  it('falls back to the leaf when alias is missing', () => {
    expect(fieldDisplayLabel(undefined, 'orders.x.product_id')).toBe('product_id');
  });
  it('ignores a whitespace-only alias', () => {
    expect(fieldDisplayLabel('   ', 'orders.x.product_id')).toBe('product_id');
  });
  it('handles a blended leaf basis (no dots)', () => {
    expect(fieldDisplayLabel(undefined, 'product_id')).toBe('product_id');
  });
});
