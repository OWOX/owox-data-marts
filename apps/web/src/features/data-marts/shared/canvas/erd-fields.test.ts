import { describe, expect, it } from 'vitest';
import {
  ALL_FIELD_ROW_LABELS,
  ERD_EXPAND_ROW_HEIGHT,
  ERD_ROW_EXTRA_LINE_HEIGHT,
  ERD_ROW_HEIGHT,
  erdFieldsBodyHeight,
  erdRowHeight,
  fieldAliasLine,
  fieldDescriptionLine,
  type ErdCardField,
} from './erd-fields';

function field(name: string, extra: Partial<ErdCardField> = {}): ErdCardField {
  return { name, alias: name, type: 'STRING', isPrimaryKey: false, isHidden: false, ...extra };
}

const NO_LABELS = { alias: false, description: false };

describe('field row lines', () => {
  it('shows the alias only when it differs from the field name', () => {
    expect(fieldAliasLine(field('order_id', { alias: 'Order ID' }), ALL_FIELD_ROW_LABELS)).toBe(
      'Order ID'
    );
    expect(fieldAliasLine(field('order_id'), ALL_FIELD_ROW_LABELS)).toBeNull();
    expect(fieldAliasLine(field('order_id', { alias: 'Order ID' }), NO_LABELS)).toBeNull();
  });

  it('shows the description only when set and enabled', () => {
    const described = field('order_id', { description: 'Order key' });
    expect(fieldDescriptionLine(described, ALL_FIELD_ROW_LABELS)).toBe('Order key');
    expect(fieldDescriptionLine(field('order_id'), ALL_FIELD_ROW_LABELS)).toBeNull();
    expect(fieldDescriptionLine(described, NO_LABELS)).toBeNull();
  });
});

describe('erdRowHeight', () => {
  it('adds one line per label that has content', () => {
    const full = field('order_id', { alias: 'Order ID', description: 'Order key' });
    expect(erdRowHeight(field('order_id'), ALL_FIELD_ROW_LABELS)).toBe(ERD_ROW_HEIGHT);
    expect(erdRowHeight(full, ALL_FIELD_ROW_LABELS)).toBe(
      ERD_ROW_HEIGHT + 2 * ERD_ROW_EXTRA_LINE_HEIGHT
    );
    expect(erdRowHeight(full, { alias: true, description: false })).toBe(
      ERD_ROW_HEIGHT + ERD_ROW_EXTRA_LINE_HEIGHT
    );
    expect(erdRowHeight(full, NO_LABELS)).toBe(ERD_ROW_HEIGHT);
  });
});

describe('erdFieldsBodyHeight', () => {
  it('sums only the collapsed rows, in display order (keys first)', () => {
    const fields = [
      field('a'),
      field('b'),
      field('c'),
      field('d'),
      // Fifth in source order but a primary key, so it is shown collapsed —
      // its description line must be counted, and the last row's must not.
      field('key', { isPrimaryKey: true, description: 'Key' }),
      field('e', { description: 'Hidden behind the toggle' }),
    ];
    expect(erdFieldsBodyHeight(fields, ALL_FIELD_ROW_LABELS)).toBe(
      4 * ERD_ROW_HEIGHT + ERD_ROW_EXTRA_LINE_HEIGHT + ERD_EXPAND_ROW_HEIGHT
    );
    expect(erdFieldsBodyHeight(fields, NO_LABELS)).toBe(4 * ERD_ROW_HEIGHT + ERD_EXPAND_ROW_HEIGHT);
  });

  it('is zero without fields', () => {
    expect(erdFieldsBodyHeight([])).toBe(0);
  });
});
