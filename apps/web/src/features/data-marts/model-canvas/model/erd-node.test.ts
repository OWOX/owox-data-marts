import { describe, expect, it } from 'vitest';
import {
  CARD_META_ROW_HEIGHT,
  CARD_STATUS_ROW_HEIGHT,
  COMPACT_NODE_HEIGHT,
  ERD_COLLAPSED_ROWS,
  ERD_EXPAND_ROW_HEIGHT,
  ERD_HEADER_HEIGHT,
  ERD_ROW_HEIGHT,
  collapsedRowCount,
  computeNodeHeight,
  orderFields,
} from './erd-node';
import type { CanvasNodeField } from './types';

function field(name: string, isPrimaryKey = false): CanvasNodeField {
  return { name, alias: name, type: 'STRING', isPrimaryKey, isHidden: false };
}

describe('orderFields', () => {
  it('puts primary keys first and keeps relative order stable', () => {
    const ordered = orderFields([field('a'), field('pk1', true), field('b'), field('pk2', true)]);
    expect(ordered.map(f => f.name)).toEqual(['pk1', 'pk2', 'a', 'b']);
  });
});

describe('collapsedRowCount', () => {
  it('caps at the collapsed row limit', () => {
    const fields = Array.from({ length: 10 }, (_, i) => field(`f${String(i)}`));
    expect(collapsedRowCount(fields)).toBe(ERD_COLLAPSED_ROWS);
  });

  it('never exceeds the number of fields', () => {
    expect(collapsedRowCount([field('a'), field('b')])).toBe(2);
  });

  it('keeps all primary keys visible even past the cap', () => {
    const fields = [
      ...Array.from({ length: 6 }, (_, i) => field(`pk${String(i)}`, true)),
      field('extra'),
    ];
    expect(collapsedRowCount(fields)).toBe(6);
  });
});

describe('computeNodeHeight', () => {
  it('reserves space for the third Data Quality header row', () => {
    expect(COMPACT_NODE_HEIGHT).toBe(116);
    expect(ERD_HEADER_HEIGHT).toBe(88);
  });

  it('returns the compact height outside ERD mode', () => {
    expect(computeNodeHeight({ fields: [field('a')] }, 'compact')).toBe(COMPACT_NODE_HEIGHT);
  });

  it('returns the compact height for ERD nodes without enriched fields', () => {
    expect(computeNodeHeight({ fields: undefined }, 'erd')).toBe(COMPACT_NODE_HEIGHT);
    expect(computeNodeHeight({ fields: [] }, 'erd')).toBe(COMPACT_NODE_HEIGHT);
  });

  it('shrinks by the meta row height when object labels hide the whole meta row', () => {
    expect(computeNodeHeight({ fields: [] }, 'compact', true)).toBe(
      COMPACT_NODE_HEIGHT - CARD_META_ROW_HEIGHT
    );
    const fields = [field('a')];
    expect(computeNodeHeight({ fields }, 'erd', true)).toBe(
      ERD_HEADER_HEIGHT - CARD_META_ROW_HEIGHT + ERD_ROW_HEIGHT
    );
  });

  it('also shrinks by the status icons row in title-only mode', () => {
    expect(computeNodeHeight({ fields: [] }, 'compact', true, true)).toBe(
      COMPACT_NODE_HEIGHT - CARD_META_ROW_HEIGHT - CARD_STATUS_ROW_HEIGHT
    );
    const fields = [field('a')];
    expect(computeNodeHeight({ fields }, 'erd', true, true)).toBe(
      ERD_HEADER_HEIGHT - CARD_META_ROW_HEIGHT - CARD_STATUS_ROW_HEIGHT + ERD_ROW_HEIGHT
    );
  });

  it('sums header and visible rows, adding the expand row only when collapsed rows remain', () => {
    const fits = Array.from({ length: ERD_COLLAPSED_ROWS }, (_, i) => field(`f${String(i)}`));
    expect(computeNodeHeight({ fields: fits }, 'erd')).toBe(
      ERD_HEADER_HEIGHT + ERD_COLLAPSED_ROWS * ERD_ROW_HEIGHT
    );

    const overflowing = [...fits, field('extra')];
    expect(computeNodeHeight({ fields: overflowing }, 'erd')).toBe(
      ERD_HEADER_HEIGHT + ERD_COLLAPSED_ROWS * ERD_ROW_HEIGHT + ERD_EXPAND_ROW_HEIGHT
    );
  });
});
