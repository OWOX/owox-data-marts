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

// Card rows, top to bottom: title (icon tile + name), then up to three badge
// rows — source + field count, triggers + reports, relationships — then the
// footer (quality indicators + sharing). Each row is a fixed single line so the
// estimate stays exact. A count of zero shows no badge, and a row left without
// badges is dropped.
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
/** Tallest Compact card — every row present. */
export const COMPACT_NODE_HEIGHT =
  CARD_TITLE_ROW_HEIGHT +
  CARD_FIRST_BADGE_ROW_HEIGHT +
  2 * CARD_BADGE_ROW_HEIGHT +
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

export type CardBadgeRow = 'meta' | 'usage' | 'relationships';

/**
 * The badge rows a card shows, in order: source + field count, triggers +
 * reports, relationships. Two usage counts share a row; three counts would not
 * fit one line of the card.
 */
export function cardBadgeRows(badges: CardBadges): CardBadgeRow[] {
  const rows: CardBadgeRow[] = [];
  if (badges.definition || badges.fieldCount) rows.push('meta');
  if (badges.triggers || badges.reports) rows.push('usage');
  if (badges.relationships) rows.push('relationships');
  return rows;
}

/** Height of the card header (everything above the ERD field rows). */
function cardHeaderHeight(node: CardBadgeInput, options: NodeLayoutOptions): number {
  const rowCount = cardBadgeRows(cardBadges(node, options)).length;
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
  options: NodeLayoutOptions = {}
): number {
  const header = cardHeaderHeight(node, options);
  if (viewMode !== 'erd') return header;
  const fields = node.fields ?? [];
  if (fields.length === 0) return header;
  return header + erdFieldsBodyHeight(fields, options.fieldLabels ?? ALL_FIELD_ROW_LABELS);
}
