import type { DataQualityCompactSummary } from '../../../shared/types';
import type { DataLastUpdatedDto } from '../../../shared/types/api/response/data-mart-data-last-updated.dto';
import type { DataMartDefinitionType } from '../../../shared/enums/data-mart-definition-type.enum';
import type { DataMartIconValue } from '../../../shared/enums/data-mart-icon.enum';
import { DataMartDefinitionTypeModel } from '../../../shared/types/data-mart-definition-type.model';
import type { CanvasViewMode } from '../../../shared/canvas/view-mode';
import type { ObjectLabelsHidden } from '../../../shared/canvas/object-labels';
import { erdFieldsBodyHeight, type ErdCardField } from '../../../shared/canvas/erd-fields';
import { measureBadgeText } from '../../../shared/canvas/measure-badge-text';
import {
  cardHeaderHeightForLines,
  packBadges,
  pluralizeCount,
  type CardBadgeKind,
  type TextMeasure,
} from '../../../model-canvas/model/erd-node';

/**
 * What a Joinable Data Marts card shows besides the relationship itself: the
 * same Data Mart facts the Models canvas card shows, read from the storage's
 * model. Every field is unknown until its request resolves, and an unknown
 * value shows nothing — no badge, no footer icon.
 */
export interface RelationshipCardDetails {
  icon?: DataMartIconValue | null;
  triggersCount?: number;
  reportsCount?: number;
  /** Relationships the Data Mart takes part in, over the storage's whole model. */
  relationshipCount?: number;
  dataLastUpdated?: DataLastUpdatedDto | null;
  availableForReporting?: boolean;
  availableForMaintenance?: boolean;
  qualitySummary?: DataQualityCompactSummary;
}

/** The pills of a Joinable Data Marts card: the Models card's, plus the join alias. */
export type RelationshipCardBadgeKind = CardBadgeKind | 'alias';

export interface RelationshipCardBadge {
  kind: RelationshipCardBadgeKind;
  label: string;
  /** Full text for a label that is shortened or needs explaining. */
  title?: string;
}

export interface RelationshipCardBadgeInput {
  definitionType: DataMartDefinitionType | null;
  /** The relationship's alias; the root card has none. */
  targetAlias?: string;
  /** Fields this relationship brings into the root Data Mart. */
  fieldCount?: number;
  triggersCount?: number;
  reportsCount?: number;
  relationshipCount?: number;
}

/** A longer alias is cut so its pill keeps to the card width; the tooltip has it whole. */
export const ALIAS_BADGE_MAX_CHARS = 24;

/** Names the pill as the Join Settings tab does, so it never reads as a table name. */
export function aliasBadgeTitle(alias: string): string {
  return `SQL Alias: ${alias}`;
}

/**
 * The pills a card shows, in display order: input source, alias, fields,
 * triggers, reports, relationships. As on the Models canvas, a count of zero
 * or an unknown count shows no pill, and each pill but the alias has its own
 * object label. The alias is join configuration, not an object label, so it
 * always shows.
 */
export function relationshipCardBadgeList(
  input: RelationshipCardBadgeInput,
  labels: ObjectLabelsHidden
): RelationshipCardBadge[] {
  const list: RelationshipCardBadge[] = [];
  if (
    !labels.source &&
    input.definitionType &&
    DataMartDefinitionTypeModel.getInfo(input.definitionType).type !== null
  ) {
    list.push({
      kind: 'definition',
      label: DataMartDefinitionTypeModel.getInfo(input.definitionType).displayName,
    });
  }
  if (input.targetAlias) {
    const alias = input.targetAlias;
    list.push({
      kind: 'alias',
      label:
        alias.length > ALIAS_BADGE_MAX_CHARS
          ? `${alias.slice(0, ALIAS_BADGE_MAX_CHARS - 1)}…`
          : alias,
      title: aliasBadgeTitle(alias),
    });
  }
  const counts: [CardBadgeKind, number | undefined, boolean, string][] = [
    ['fields', input.fieldCount, labels.fields, 'field'],
    ['triggers', input.triggersCount, labels.triggers, 'trigger'],
    ['reports', input.reportsCount, labels.reports, 'report'],
    ['relationships', input.relationshipCount, labels.relationships, 'relationship'],
  ];
  for (const [kind, count, hidden, singular] of counts) {
    if (!hidden && count !== undefined && count > 0) {
      list.push({ kind, label: pluralizeCount(count, singular) });
    }
  }
  return list;
}

/**
 * The pill lines a card shows, packed by width exactly as the Models card
 * packs them. The root card keeps the Compact width in every view mode.
 */
export function relationshipCardBadgeLines(
  input: RelationshipCardBadgeInput,
  viewMode: CanvasViewMode,
  labels: ObjectLabelsHidden,
  measure: TextMeasure = measureBadgeText
): RelationshipCardBadge[][] {
  return packBadges(relationshipCardBadgeList(input, labels), viewMode, measure);
}

/**
 * Whether a card has a footer: its object label is ticked and the Data Mart's
 * details are known. A Data Mart the user cannot open has none, so its card
 * closes under the pills instead of showing an empty footer.
 */
export function hasRelationshipCardFooter(
  details: RelationshipCardDetails | undefined,
  labels: ObjectLabelsHidden
): boolean {
  return !labels.footer && details !== undefined;
}

/**
 * Collapsed card height, for dagre and as the initial render size: the same
 * rows as a Models card, plus the field rows of a related Data Mart in the ERD
 * view. An expanded field list may overlap the card below (as on the Models canvas).
 */
export function relationshipCardHeight({
  badgeLineCount,
  withFooter,
  fields,
  viewMode,
  fieldLabels,
}: {
  badgeLineCount: number;
  withFooter: boolean;
  fields: ErdCardField[];
  viewMode: CanvasViewMode;
  fieldLabels: Parameters<typeof erdFieldsBodyHeight>[1];
}): number {
  const header = cardHeaderHeightForLines(badgeLineCount, !withFooter);
  if (viewMode !== 'erd' || fields.length === 0) return header;
  return header + erdFieldsBodyHeight(fields, fieldLabels);
}
