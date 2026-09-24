import { describe, expect, it } from 'vitest';
import {
  CARD_META_ROW_HEIGHT,
  CARD_STATUS_ROW_HEIGHT,
  CARD_TITLE_ONLY_PADDING,
  COMPACT_NODE_HEIGHT,
  ERD_COLLAPSED_ROWS,
  ERD_EXPAND_ROW_HEIGHT,
  ERD_HEADER_HEIGHT,
  ERD_ROW_EXTRA_LINE_HEIGHT,
  ERD_ROW_HEIGHT,
  collapsedRowCount,
  computeNodeHeight,
  nodeLayoutOptions,
  orderFields,
} from './erd-node';
import { ALL_HIDDEN, NOTHING_HIDDEN } from '../../shared/canvas/object-labels';
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
  it('sizes the card as title + badges + counts + footer rows', () => {
    expect(COMPACT_NODE_HEIGHT).toBe(134);
    expect(ERD_HEADER_HEIGHT).toBe(COMPACT_NODE_HEIGHT);
  });

  it('returns the compact height outside ERD mode', () => {
    expect(computeNodeHeight({ fields: [field('a')] }, 'compact')).toBe(COMPACT_NODE_HEIGHT);
  });

  it('returns the compact height for ERD nodes without enriched fields', () => {
    expect(computeNodeHeight({ fields: undefined }, 'erd')).toBe(COMPACT_NODE_HEIGHT);
    expect(computeNodeHeight({ fields: [] }, 'erd')).toBe(COMPACT_NODE_HEIGHT);
  });

  it('shrinks by the meta row height when object labels hide the whole meta row', () => {
    expect(computeNodeHeight({ fields: [] }, 'compact', { metaRowHidden: true })).toBe(
      COMPACT_NODE_HEIGHT - CARD_META_ROW_HEIGHT
    );
    const fields = [field('a')];
    expect(computeNodeHeight({ fields }, 'erd', { metaRowHidden: true })).toBe(
      ERD_HEADER_HEIGHT - CARD_META_ROW_HEIGHT + ERD_ROW_HEIGHT
    );
  });

  it('also shrinks by the status icons row in title-only mode', () => {
    const titleOnly = { metaRowHidden: true, statusRowHidden: true };
    expect(computeNodeHeight({ fields: [] }, 'compact', titleOnly)).toBe(
      COMPACT_NODE_HEIGHT - CARD_META_ROW_HEIGHT - CARD_STATUS_ROW_HEIGHT + CARD_TITLE_ONLY_PADDING
    );
    const fields = [field('a')];
    expect(computeNodeHeight({ fields }, 'erd', titleOnly)).toBe(
      ERD_HEADER_HEIGHT -
        CARD_META_ROW_HEIGHT -
        CARD_STATUS_ROW_HEIGHT +
        CARD_TITLE_ONLY_PADDING +
        ERD_ROW_HEIGHT
    );
  });

  it('adds a line per shown description and drops it when the label is off', () => {
    const fields = [field('a'), { ...field('b'), alias: 'B alias', description: 'B described' }];
    // The alias swaps the row text, so only the description adds height.
    expect(computeNodeHeight({ fields }, 'erd')).toBe(
      ERD_HEADER_HEIGHT + 2 * ERD_ROW_HEIGHT + ERD_ROW_EXTRA_LINE_HEIGHT
    );
    expect(
      computeNodeHeight({ fields }, 'erd', { fieldLabels: { alias: false, description: false } })
    ).toBe(ERD_HEADER_HEIGHT + 2 * ERD_ROW_HEIGHT);
    // Compact cards have no field rows, so the labels never change their height.
    expect(computeNodeHeight({ fields }, 'compact')).toBe(COMPACT_NODE_HEIGHT);
  });

  it('derives the layout options from the object-labels preference', () => {
    expect(nodeLayoutOptions(NOTHING_HIDDEN)).toEqual({
      metaRowHidden: false,
      statusRowHidden: false,
      fieldLabels: { alias: true, description: true },
    });
    // The Draft pill lives in the title row, so the status label no longer shapes the badges row.
    expect(nodeLayoutOptions({ ...NOTHING_HIDDEN, source: true, status: true })).toEqual({
      metaRowHidden: false,
      statusRowHidden: false,
      fieldLabels: { alias: true, description: true },
    });
    expect(nodeLayoutOptions({ ...NOTHING_HIDDEN, source: true, fields: true })).toEqual({
      metaRowHidden: true,
      statusRowHidden: false,
      fieldLabels: { alias: true, description: true },
    });
    expect(nodeLayoutOptions(ALL_HIDDEN)).toEqual({
      metaRowHidden: true,
      statusRowHidden: true,
      fieldLabels: { alias: false, description: false },
    });
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
