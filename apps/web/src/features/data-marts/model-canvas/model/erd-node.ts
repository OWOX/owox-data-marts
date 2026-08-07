import {
  collapsedRowCount,
  ERD_EXPAND_ROW_HEIGHT,
  ERD_ROW_HEIGHT,
} from '../../shared/canvas/erd-fields';
import type { CanvasViewMode } from '../../shared/canvas/view-mode';
import type { ModelCanvasNode } from './types';

/** Canvas node display density. Compact = header only; ERD = header + field rows. */
export type { CanvasViewMode } from '../../shared/canvas/view-mode';
export {
  collapsedRowCount,
  ERD_COLLAPSED_ROWS,
  ERD_EXPAND_ROW_HEIGHT,
  ERD_ROW_HEIGHT,
  orderFields,
} from '../../shared/canvas/erd-fields';

// ---- Layout geometry -------------------------------------------------------
// The dagre layout runs before render, so it needs a size estimate per node.
// It always sizes to the COLLAPSED height: the default picture stays tidy, and
// an expanded ERD node may overlap below until the user drags it (nodes are
// draggable) — same behaviour as owox/models.

export const COMPACT_NODE_WIDTH = 212;
export const COMPACT_NODE_HEIGHT = 116;

export const ERD_NODE_WIDTH = 256;
export const ERD_HEADER_HEIGHT = 88; // title + meta + Data Quality rows
/** Height of the meta row (the source badge), subtracted when object labels hide it. */
export const CARD_META_ROW_HEIGHT = 36;
/** Height of the status icons row (quality shield + Data Last Updated + field count), dropped in title-only mode. */
export const CARD_STATUS_ROW_HEIGHT = 30;

export function nodeWidth(viewMode: CanvasViewMode): number {
  return viewMode === 'erd' ? ERD_NODE_WIDTH : COMPACT_NODE_WIDTH;
}

/**
 * Collapsed layout height for a node, used by dagre and as the initial render
 * size. `metaRowHidden` reflects the object-labels preference: when the
 * source badge is hidden, the card drops its meta row (the field count lives
 * in the status icons row).
 * `statusRowHidden` reflects title-only mode, which also drops the quality
 * indicators row (Data Quality shield + Data Last Updated clock).
 */
export function computeNodeHeight(
  node: Pick<ModelCanvasNode, 'fields'>,
  viewMode: CanvasViewMode,
  metaRowHidden = false,
  statusRowHidden = false
): number {
  const metaAdjustment =
    (metaRowHidden ? -CARD_META_ROW_HEIGHT : 0) + (statusRowHidden ? -CARD_STATUS_ROW_HEIGHT : 0);
  if (viewMode !== 'erd') return COMPACT_NODE_HEIGHT + metaAdjustment;
  const fields = node.fields ?? [];
  if (fields.length === 0) return COMPACT_NODE_HEIGHT + metaAdjustment;
  const rows = collapsedRowCount(fields);
  const hasMore = fields.length > rows;
  return (
    ERD_HEADER_HEIGHT +
    metaAdjustment +
    rows * ERD_ROW_HEIGHT +
    (hasMore ? ERD_EXPAND_ROW_HEIGHT : 0)
  );
}
