import { describe, expect, it } from 'vitest';
import { NOTHING_HIDDEN } from '../../../shared/canvas/object-labels';
import { DataMartDefinitionType } from '../../../shared/enums/data-mart-definition-type.enum';
import {
  CARD_FOOTER_HEIGHT,
  CARD_FIRST_BADGE_ROW_HEIGHT,
  CARD_NO_FOOTER_PADDING,
  CARD_TITLE_ROW_HEIGHT,
} from '../../../model-canvas/model/erd-node';
import {
  ALIAS_BADGE_MAX_CHARS,
  hasRelationshipCardFooter,
  relationshipCardBadgeLines,
  relationshipCardBadgeList,
  relationshipCardHeight,
} from './relationship-card';

const measure = (text: string) => text.length * 6;

describe('relationshipCardBadgeList', () => {
  it('lists the pills in card order: source, alias, fields, triggers, reports, relationships', () => {
    const badges = relationshipCardBadgeList(
      {
        definitionType: DataMartDefinitionType.SQL,
        targetAlias: 'orders',
        fieldCount: 5,
        triggersCount: 1,
        reportsCount: 2,
        relationshipCount: 3,
      },
      NOTHING_HIDDEN
    );

    expect(badges.map(badge => badge.kind)).toEqual([
      'definition',
      'alias',
      'fields',
      'triggers',
      'reports',
      'relationships',
    ]);
    expect(badges.map(badge => badge.label)).toEqual([
      'SQL',
      'orders',
      '5 fields',
      '1 trigger',
      '2 reports',
      '3 relationships',
    ]);
  });

  it('drops a count of zero, an unknown count and every pill its object label hides', () => {
    const badges = relationshipCardBadgeList(
      {
        definitionType: DataMartDefinitionType.TABLE,
        targetAlias: 'orders',
        fieldCount: 0,
        triggersCount: undefined,
        reportsCount: 4,
        relationshipCount: 2,
      },
      { ...NOTHING_HIDDEN, source: true, relationships: true }
    );

    expect(badges.map(badge => badge.kind)).toEqual(['alias', 'reports']);
  });

  it('keeps the alias, the join configuration, whatever the object labels say', () => {
    const badges = relationshipCardBadgeList(
      { definitionType: null, targetAlias: 'orders', fieldCount: 5 },
      { ...NOTHING_HIDDEN, source: true, fields: true }
    );

    expect(badges.map(badge => badge.kind)).toEqual(['alias']);
  });

  it('cuts a long alias to the card width and keeps it whole in the tooltip', () => {
    const alias = 'a_very_long_relationship_alias_name';
    const [badge] = relationshipCardBadgeList(
      { definitionType: null, targetAlias: alias },
      NOTHING_HIDDEN
    );

    expect(badge.label).toHaveLength(ALIAS_BADGE_MAX_CHARS);
    expect(badge.label.endsWith('…')).toBe(true);
    expect(badge.title).toContain(alias);
  });
});

describe('relationshipCardBadgeLines', () => {
  it('packs the pills onto as few lines as the card width allows', () => {
    const lines = relationshipCardBadgeLines(
      {
        definitionType: DataMartDefinitionType.VIEW,
        targetAlias: 'orders',
        fieldCount: 5,
        triggersCount: 1,
        reportsCount: 2,
        relationshipCount: 3,
      },
      'compact',
      NOTHING_HIDDEN,
      measure
    );

    expect(lines.length).toBeGreaterThan(1);
    expect(lines.flat()).toHaveLength(6);
  });
});

describe('relationshipCardHeight', () => {
  it('adds the footer only when the card has one', () => {
    const base = {
      badgeLineCount: 1,
      fields: [],
      viewMode: 'compact' as const,
      fieldLabels: { alias: true, description: true },
    };

    expect(relationshipCardHeight({ ...base, withFooter: true })).toBe(
      CARD_TITLE_ROW_HEIGHT + CARD_FIRST_BADGE_ROW_HEIGHT + CARD_FOOTER_HEIGHT
    );
    expect(relationshipCardHeight({ ...base, withFooter: false })).toBe(
      CARD_TITLE_ROW_HEIGHT + CARD_FIRST_BADGE_ROW_HEIGHT + CARD_NO_FOOTER_PADDING
    );
  });
});

describe('hasRelationshipCardFooter', () => {
  it('needs known details and a ticked footer object label', () => {
    expect(hasRelationshipCardFooter({}, NOTHING_HIDDEN)).toBe(true);
    expect(hasRelationshipCardFooter(undefined, NOTHING_HIDDEN)).toBe(false);
    expect(hasRelationshipCardFooter({}, { ...NOTHING_HIDDEN, footer: true })).toBe(false);
  });
});
