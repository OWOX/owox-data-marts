import {
  ALL_FIELD_ROW_LABELS,
  erdFieldsBodyHeight,
  type ErdFieldRowLabels,
} from '../../shared/canvas/erd-fields';
import {
  isTitleOnly,
  toFieldRowLabels,
  type ObjectLabelsHidden,
} from '../../shared/canvas/object-labels';
import type { CanvasViewMode } from '../../shared/canvas/view-mode';
import { DataMartDefinitionTypeModel } from '../../shared/types/data-mart-definition-type.model';
import { measureBadgeText } from '../../shared/canvas/measure-badge-text';
import type { ModelCanvasNode } from './types';

/** Canvas node display density. Compact = header only; ERD = header + field rows. */
export type { CanvasViewMode } from '../../shared/canvas/view-mode';
export {
  collapsedRowCount,
  ERD_COLLAPSED_ROWS,
  ERD_EXPAND_ROW_HEIGHT,
  ERD_ROW_EXTRA_LINE_HEIGHT,
  ERD_ROW_HEIGHT,
  orderFields,
} from '../../shared/canvas/erd-fields';

// ---- Layout geometry -------------------------------------------------------
// The dagre layout runs before render, so it needs a size estimate per node.
// It always sizes to the COLLAPSED height: the default picture stays tidy, and
// an expanded ERD node may overlap below until the user drags it (nodes are
// draggable) — same behaviour as owox/models.

// Card rows, top to bottom: title (icon tile + name), the source + field count
// row, the count badges (triggers, reports, relationships) packed onto as few
// lines as their measured widths allow, then the footer (quality indicators +
// sharing). Every line is a fixed single line, and the card and this estimate
// pack the badges the same way, so the estimate stays exact. A count of zero
// shows no badge, and a line left without badges is dropped.
/** Title row: top padding + the 28px icon tile. */
export const CARD_TITLE_ROW_HEIGHT = 40;
/** Extra bottom padding the title row gets when it is all the card shows. */
export const CARD_TITLE_ONLY_PADDING = 12;
/** The first badge row, right under the title (it takes the larger top padding). */
export const CARD_FIRST_BADGE_ROW_HEIGHT = 28;
/** Every further badge row. */
export const CARD_BADGE_ROW_HEIGHT = 24;
/** Footer: quality indicators + sharing, dropped in title-only mode. */
export const CARD_FOOTER_HEIGHT = 42;

export const COMPACT_NODE_WIDTH = 240;
/** Tallest Compact card — every count on its own line. */
export const COMPACT_NODE_HEIGHT =
  CARD_TITLE_ROW_HEIGHT +
  CARD_FIRST_BADGE_ROW_HEIGHT +
  3 * CARD_BADGE_ROW_HEIGHT +
  CARD_FOOTER_HEIGHT;

export const ERD_NODE_WIDTH = 256;

export function nodeWidth(viewMode: CanvasViewMode): number {
  return viewMode === 'erd' ? ERD_NODE_WIDTH : COMPACT_NODE_WIDTH;
}

/** What the object-labels preference hides — shared by every node. */
export interface NodeLayoutOptions {
  /** The input source badge is unticked. */
  sourceHidden?: boolean;
  /** The field count badge is unticked. */
  fieldCountHidden?: boolean;
  /** Title-only mode: the counts row and the footer are dropped too. */
  statusRowHidden?: boolean;
  /** Which optional lines each ERD field row shows. */
  fieldLabels?: ErdFieldRowLabels;
}

/** Derive the layout options once per preference — every node shares them. */
export function nodeLayoutOptions(objectLabels: ObjectLabelsHidden): Required<NodeLayoutOptions> {
  return {
    sourceHidden: objectLabels.source,
    fieldCountHidden: objectLabels.fields,
    statusRowHidden: isTitleOnly(objectLabels),
    fieldLabels: toFieldRowLabels(objectLabels),
  };
}

export type CardBadgeInput = Pick<
  ModelCanvasNode,
  'definitionType' | 'fieldCount' | 'triggersCount' | 'reportsCount' | 'relationshipCount'
>;

/** Which badges a card shows. The card and the layout estimate both read it. */
export interface CardBadges {
  definition: boolean;
  fieldCount: boolean;
  triggers: boolean;
  reports: boolean;
  relationships: boolean;
}

export function cardBadges(
  node: CardBadgeInput,
  {
    sourceHidden = false,
    fieldCountHidden = false,
    statusRowHidden = false,
  }: NodeLayoutOptions = {}
): CardBadges {
  return {
    // Waits for the type: nothing while enrichment is pending or failed.
    definition:
      !sourceHidden &&
      !!node.definitionType &&
      DataMartDefinitionTypeModel.getInfo(node.definitionType).type !== null,
    fieldCount: !fieldCountHidden && node.fieldCount > 0,
    triggers: !statusRowHidden && (node.triggersCount ?? 0) > 0,
    reports: !statusRowHidden && (node.reportsCount ?? 0) > 0,
    relationships: !statusRowHidden && (node.relationshipCount ?? 0) > 0,
  };
}

export function pluralizeCount(count: number, singular: string): string {
  return `${String(count)} ${singular}${count === 1 ? '' : 's'}`;
}

export type CardCountKind = 'triggers' | 'reports' | 'relationships';

export interface CardCountBadge {
  kind: CardCountKind;
  label: string;
}

/** The count badges a card shows, in display order. */
export function cardCountBadges(node: CardBadgeInput, badges: CardBadges): CardCountBadge[] {
  const counts: CardCountBadge[] = [];
  if (badges.triggers) {
    counts.push({ kind: 'triggers', label: pluralizeCount(node.triggersCount ?? 0, 'trigger') });
  }
  if (badges.reports) {
    counts.push({ kind: 'reports', label: pluralizeCount(node.reportsCount ?? 0, 'report') });
  }
  if (badges.relationships) {
    counts.push({
      kind: 'relationships',
      label: pluralizeCount(node.relationshipCount ?? 0, 'relationship'),
    });
  }
  return counts;
}

/** Horizontal padding of a card row (`pl-3` + `pr-3`). */
export const CARD_ROW_INSET = 24;
/** A badge's width besides its text: `px-1.5` + the 12px icon + `gap-1`. */
export const CARD_BADGE_CHROME = 28;
/** Space between two badges on a line (`gap-1`). */
export const CARD_BADGE_GAP = 4;
/** Slack per badge so sub-pixel text rounding never wraps a line the estimate kept whole. */
const CARD_BADGE_SLACK = 2;

export type TextMeasure = (text: string) => number;

/**
 * Packs the count badges onto lines, in order, starting a new line when the
 * next badge would not fit the card's width. The card renders these lines and
 * the layout estimate counts them, so both agree.
 */
export function packCountBadges(
  counts: readonly CardCountBadge[],
  viewMode: CanvasViewMode,
  measure: TextMeasure = measureBadgeText
): CardCountBadge[][] {
  const available = nodeWidth(viewMode) - CARD_ROW_INSET;
  const lines: CardCountBadge[][] = [];
  let lineWidth = 0;
  for (const count of counts) {
    const width = Math.ceil(measure(count.label)) + CARD_BADGE_CHROME + CARD_BADGE_SLACK;
    const current = lines.at(-1);
    if (current && lineWidth + CARD_BADGE_GAP + width <= available) {
      current.push(count);
      lineWidth += CARD_BADGE_GAP + width;
    } else {
      lines.push([count]);
      lineWidth = width;
    }
  }
  return lines;
}

/** Number of badge lines a card shows: the source + field count line, then the packed counts. */
export function cardBadgeLineCount(
  node: CardBadgeInput,
  viewMode: CanvasViewMode,
  options: NodeLayoutOptions = {},
  measure: TextMeasure = measureBadgeText
): number {
  const badges = cardBadges(node, options);
  const metaLine = badges.definition || badges.fieldCount ? 1 : 0;
  return metaLine + packCountBadges(cardCountBadges(node, badges), viewMode, measure).length;
}

/** Height of the card header (everything above the ERD field rows). */
function cardHeaderHeight(
  node: CardBadgeInput,
  viewMode: CanvasViewMode,
  options: NodeLayoutOptions,
  measure: TextMeasure
): number {
  const rowCount = cardBadgeLineCount(node, viewMode, options, measure);
  const rowsHeight =
    rowCount === 0 ? 0 : CARD_FIRST_BADGE_ROW_HEIGHT + (rowCount - 1) * CARD_BADGE_ROW_HEIGHT;
  const tail = options.statusRowHidden ? CARD_TITLE_ONLY_PADDING : CARD_FOOTER_HEIGHT;
  return CARD_TITLE_ROW_HEIGHT + rowsHeight + tail;
}

/**
 * Collapsed layout height for a node, used by dagre and as the initial render
 * size: the header rows the node's content and the preference leave, plus the
 * ERD field rows in the Detailed view.
 */
export function computeNodeHeight(
  node: CardBadgeInput & Pick<ModelCanvasNode, 'fields'>,
  viewMode: CanvasViewMode,
  options: NodeLayoutOptions = {},
  measure: TextMeasure = measureBadgeText
): number {
  const header = cardHeaderHeight(node, viewMode, options, measure);
  if (viewMode !== 'erd') return header;
  const fields = node.fields ?? [];
  if (fields.length === 0) return header;
  return header + erdFieldsBodyHeight(fields, options.fieldLabels ?? ALL_FIELD_ROW_LABELS);
}
