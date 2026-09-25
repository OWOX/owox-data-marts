import { describe, expect, it } from 'vitest';
import {
  CARD_BADGE_ROW_HEIGHT,
  CARD_FIRST_BADGE_ROW_HEIGHT,
  CARD_FOOTER_HEIGHT,
  CARD_TITLE_ONLY_PADDING,
  CARD_TITLE_ROW_HEIGHT,
  COMPACT_NODE_HEIGHT,
  ERD_COLLAPSED_ROWS,
  ERD_EXPAND_ROW_HEIGHT,
  ERD_ROW_EXTRA_LINE_HEIGHT,
  ERD_ROW_HEIGHT,
  cardBadgeRows,
  cardBadges,
  collapsedRowCount,
  computeNodeHeight,
  nodeLayoutOptions,
  orderFields,
  type CardBadgeInput,
} from './erd-node';
import { DataMartDefinitionType } from '../../shared/enums/data-mart-definition-type.enum';
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

/** A card with every badge: known source, fields, triggers, reports and relationships. */
const FULL: CardBadgeInput = {
  definitionType: DataMartDefinitionType.VIEW,
  fieldCount: 3,
  triggersCount: 2,
  reportsCount: 4,
  relationshipCount: 1,
};
const EMPTY: CardBadgeInput = { definitionType: null, fieldCount: 0 };

describe('cardBadges', () => {
  it('shows every badge with a non-zero count', () => {
    expect(cardBadges(FULL)).toEqual({
      definition: true,
      fieldCount: true,
      triggers: true,
      reports: true,
      relationships: true,
    });
  });

  it('hides zero counts, an unknown source and not-yet-enriched triggers', () => {
    expect(
      cardBadges({
        ...FULL,
        fieldCount: 0,
        triggersCount: 0,
        reportsCount: 0,
        relationshipCount: 0,
      })
    ).toMatchObject({ fieldCount: false, triggers: false, reports: false, relationships: false });
    expect(cardBadges({ ...FULL, definitionType: null, triggersCount: undefined })).toMatchObject({
      definition: false,
      triggers: false,
    });
  });

  it('follows the object labels', () => {
    expect(cardBadges(FULL, nodeLayoutOptions({ ...NOTHING_HIDDEN, source: true }))).toMatchObject({
      definition: false,
      fieldCount: true,
    });
    expect(cardBadges(FULL, nodeLayoutOptions(ALL_HIDDEN))).toEqual({
      definition: false,
      fieldCount: false,
      triggers: false,
      reports: false,
      relationships: false,
    });
  });
});

describe('cardBadgeRows', () => {
  it('orders the rows as source + fields, triggers + reports, relationships', () => {
    expect(cardBadgeRows(cardBadges(FULL))).toEqual(['meta', 'usage', 'relationships']);
  });

  it('keeps the usage row for either count and drops the rows left empty', () => {
    expect(cardBadgeRows(cardBadges({ ...FULL, triggersCount: 0 }))).toEqual([
      'meta',
      'usage',
      'relationships',
    ]);
    expect(
      cardBadgeRows(
        cardBadges({ ...FULL, triggersCount: 0, reportsCount: 0, relationshipCount: 0 })
      )
    ).toEqual(['meta']);
    expect(cardBadgeRows(cardBadges(EMPTY))).toEqual([]);
  });
});

describe('computeNodeHeight', () => {
  it('sizes a full card as title + three badge rows + footer', () => {
    expect(COMPACT_NODE_HEIGHT).toBe(158);
    expect(computeNodeHeight(FULL, 'compact')).toBe(COMPACT_NODE_HEIGHT);
  });

  it('drops the rows whose badges are all hidden or zero', () => {
    expect(computeNodeHeight({ ...FULL, triggersCount: 0, reportsCount: 0 }, 'compact')).toBe(
      COMPACT_NODE_HEIGHT - CARD_BADGE_ROW_HEIGHT
    );
    expect(computeNodeHeight({ ...FULL, relationshipCount: 0 }, 'compact')).toBe(
      COMPACT_NODE_HEIGHT - CARD_BADGE_ROW_HEIGHT
    );
    // Whichever row comes first takes the larger top padding.
    expect(computeNodeHeight({ ...FULL, definitionType: null, fieldCount: 0 }, 'compact')).toBe(
      CARD_TITLE_ROW_HEIGHT +
        CARD_FIRST_BADGE_ROW_HEIGHT +
        CARD_BADGE_ROW_HEIGHT +
        CARD_FOOTER_HEIGHT
    );
    expect(computeNodeHeight(EMPTY, 'compact')).toBe(CARD_TITLE_ROW_HEIGHT + CARD_FOOTER_HEIGHT);
  });

  it('keeps only the padded title row in title-only mode', () => {
    const titleOnly = nodeLayoutOptions(ALL_HIDDEN);
    expect(computeNodeHeight(FULL, 'compact', titleOnly)).toBe(
      CARD_TITLE_ROW_HEIGHT + CARD_TITLE_ONLY_PADDING
    );
    const fields = [field('a')];
    expect(computeNodeHeight({ ...FULL, fields }, 'erd', titleOnly)).toBe(
      CARD_TITLE_ROW_HEIGHT + CARD_TITLE_ONLY_PADDING + ERD_ROW_HEIGHT
    );
  });

  it('returns the header height for ERD nodes without enriched fields', () => {
    expect(computeNodeHeight({ ...FULL, fields: undefined }, 'erd')).toBe(COMPACT_NODE_HEIGHT);
    expect(computeNodeHeight({ ...FULL, fields: [] }, 'erd')).toBe(COMPACT_NODE_HEIGHT);
  });

  it('adds a line per shown description and drops it when the label is off', () => {
    const fields = [field('a'), { ...field('b'), alias: 'B alias', description: 'B described' }];
    // The alias swaps the row text, so only the description adds height.
    expect(computeNodeHeight({ ...FULL, fields }, 'erd')).toBe(
      COMPACT_NODE_HEIGHT + 2 * ERD_ROW_HEIGHT + ERD_ROW_EXTRA_LINE_HEIGHT
    );
    expect(
      computeNodeHeight({ ...FULL, fields }, 'erd', {
        fieldLabels: { alias: false, description: false },
      })
    ).toBe(COMPACT_NODE_HEIGHT + 2 * ERD_ROW_HEIGHT);
    // Compact cards have no field rows, so the labels never change their height.
    expect(computeNodeHeight({ ...FULL, fields }, 'compact')).toBe(COMPACT_NODE_HEIGHT);
  });

  it('derives the layout options from the object-labels preference', () => {
    expect(nodeLayoutOptions(NOTHING_HIDDEN)).toEqual({
      sourceHidden: false,
      fieldCountHidden: false,
      statusRowHidden: false,
      fieldLabels: { alias: true, description: true },
    });
    expect(nodeLayoutOptions(ALL_HIDDEN)).toEqual({
      sourceHidden: true,
      fieldCountHidden: true,
      statusRowHidden: true,
      fieldLabels: { alias: false, description: false },
    });
  });

  it('sums header and visible rows, adding the expand row only when collapsed rows remain', () => {
    const fits = Array.from({ length: ERD_COLLAPSED_ROWS }, (_, i) => field(`f${String(i)}`));
    expect(computeNodeHeight({ ...FULL, fields: fits }, 'erd')).toBe(
      COMPACT_NODE_HEIGHT + ERD_COLLAPSED_ROWS * ERD_ROW_HEIGHT
    );

    const overflowing = [...fits, field('extra')];
    expect(computeNodeHeight({ ...FULL, fields: overflowing }, 'erd')).toBe(
      COMPACT_NODE_HEIGHT + ERD_COLLAPSED_ROWS * ERD_ROW_HEIGHT + ERD_EXPAND_ROW_HEIGHT
    );
  });
});
