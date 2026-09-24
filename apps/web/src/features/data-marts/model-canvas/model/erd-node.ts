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

// Card rows, top to bottom: title (icon tile + name), badges (input source +
// field count), counts (triggers + relationships), footer (quality indicators
// + sharing). Each row is a fixed single line so the estimate stays exact.
/** Title row: top padding + the 28px icon tile. */
export const CARD_TITLE_ROW_HEIGHT = 40;
/** Extra bottom padding the title row gets when it is all the card shows. */
export const CARD_TITLE_ONLY_PADDING = 12;
/** Badges row (input source + field count), dropped when object labels hide both. */
export const CARD_META_ROW_HEIGHT = 28;
/** Counts row (triggers + relationships) + footer (quality + sharing), dropped in title-only mode. */
export const CARD_STATUS_ROW_HEIGHT = 66;

export const COMPACT_NODE_WIDTH = 240;
export const COMPACT_NODE_HEIGHT =
  CARD_TITLE_ROW_HEIGHT + CARD_META_ROW_HEIGHT + CARD_STATUS_ROW_HEIGHT;

export const ERD_NODE_WIDTH = 256;
/** The Detailed view shares the Compact header; the field rows start right under it. */
export const ERD_HEADER_HEIGHT = COMPACT_NODE_HEIGHT;

export function nodeWidth(viewMode: CanvasViewMode): number {
  return viewMode === 'erd' ? ERD_NODE_WIDTH : COMPACT_NODE_WIDTH;
}

/** How the object-labels preference changes a card's collapsed height. */
export interface NodeLayoutOptions {
  /** Both the source badge and the field count are hidden, so the badges row is dropped. */
  metaRowHidden?: boolean;
  /** Title-only mode: the counts row and the footer are dropped too. */
  statusRowHidden?: boolean;
  /** Which optional lines each ERD field row shows. */
  fieldLabels?: ErdFieldRowLabels;
}

/** Derive the layout options once per preference — every node shares them. */
export function nodeLayoutOptions(objectLabels: ObjectLabelsHidden): Required<NodeLayoutOptions> {
  // The Draft pill sits in the title row, so the badges row only holds the
  // source badge and the field count — hiding both drops the whole row.
  return {
    metaRowHidden: objectLabels.source && objectLabels.fields,
    statusRowHidden: isTitleOnly(objectLabels),
    fieldLabels: toFieldRowLabels(objectLabels),
  };
}

/**
 * Collapsed layout height for a node, used by dagre and as the initial render
 * size. See `NodeLayoutOptions` for what the preference takes away or adds.
 */
export function computeNodeHeight(
  node: Pick<ModelCanvasNode, 'fields'>,
  viewMode: CanvasViewMode,
  {
    metaRowHidden = false,
    statusRowHidden = false,
    fieldLabels = ALL_FIELD_ROW_LABELS,
  }: NodeLayoutOptions = {}
): number {
  const metaAdjustment =
    (metaRowHidden ? -CARD_META_ROW_HEIGHT : 0) +
    (statusRowHidden ? CARD_TITLE_ONLY_PADDING - CARD_STATUS_ROW_HEIGHT : 0);
  if (viewMode !== 'erd') return COMPACT_NODE_HEIGHT + metaAdjustment;
  const fields = node.fields ?? [];
  if (fields.length === 0) return COMPACT_NODE_HEIGHT + metaAdjustment;
  return ERD_HEADER_HEIGHT + metaAdjustment + erdFieldsBodyHeight(fields, fieldLabels);
}
