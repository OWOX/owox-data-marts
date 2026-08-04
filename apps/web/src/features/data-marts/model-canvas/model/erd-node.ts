import type { CanvasNodeField, ModelCanvasNode } from './types';

/** Canvas node display density. Compact = header only; ERD = header + field rows. */
export type CanvasViewMode = 'compact' | 'erd';

// ---- Layout geometry -------------------------------------------------------
// The dagre layout runs before render, so it needs a size estimate per node.
// It always sizes to the COLLAPSED height: the default picture stays tidy, and
// an expanded ERD node may overlap below until the user drags it (nodes are
// draggable) — same behaviour as owox/models.

export const COMPACT_NODE_WIDTH = 212;
export const COMPACT_NODE_HEIGHT = 116;

export const ERD_NODE_WIDTH = 256;
export const ERD_HEADER_HEIGHT = 88; // title + meta + Data Quality rows
export const ERD_ROW_HEIGHT = 26;
export const ERD_EXPAND_ROW_HEIGHT = 26;
/** ERD nodes show at most this many rows before collapsing behind a toggle. */
export const ERD_COLLAPSED_ROWS = 4;
/** Height of the meta row (the source badge), subtracted when object labels hide it. */
export const CARD_META_ROW_HEIGHT = 36;
/** Height of the status icons row (quality shield + Data Last Updated + field count), dropped in title-only mode. */
export const CARD_STATUS_ROW_HEIGHT = 30;

export function nodeWidth(viewMode: CanvasViewMode): number {
  return viewMode === 'erd' ? ERD_NODE_WIDTH : COMPACT_NODE_WIDTH;
}

/** Primary keys first, then the rest — stable order, collapsed or expanded. */
export function orderFields(fields: CanvasNodeField[]): CanvasNodeField[] {
  return [...fields.filter(f => f.isPrimaryKey), ...fields.filter(f => !f.isPrimaryKey)];
}

/**
 * How many rows an ERD node shows when collapsed. Primary keys always stay
 * visible — they identify the mart and anchor joins conceptually — so a
 * key-heavy mart can exceed the base cap.
 */
export function collapsedRowCount(fields: CanvasNodeField[]): number {
  const keyCount = fields.filter(f => f.isPrimaryKey).length;
  return Math.min(fields.length, Math.max(ERD_COLLAPSED_ROWS, keyCount));
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
