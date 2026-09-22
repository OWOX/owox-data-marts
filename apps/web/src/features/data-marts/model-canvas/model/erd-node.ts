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

export const COMPACT_NODE_WIDTH = 212;
export const COMPACT_NODE_HEIGHT = 116;

export const ERD_NODE_WIDTH = 256;
export const ERD_HEADER_HEIGHT = 88; // title + meta + Data Quality rows
/** Height of the meta row (status pill + source badge), subtracted when object labels hide both. */
export const CARD_META_ROW_HEIGHT = 36;
/** Height of the status icons row (quality shield + Data Last Updated + field count), dropped in title-only mode. */
export const CARD_STATUS_ROW_HEIGHT = 30;

export function nodeWidth(viewMode: CanvasViewMode): number {
  return viewMode === 'erd' ? ERD_NODE_WIDTH : COMPACT_NODE_WIDTH;
}

/** How the object-labels preference changes a card's collapsed height. */
export interface NodeLayoutOptions {
  /** Both the status pill and the source badge are hidden, so the meta row is dropped. */
  metaRowHidden?: boolean;
  /** Title-only mode: the quality indicators row (shield + clock + field count) is dropped too. */
  statusRowHidden?: boolean;
  /** Which optional lines each ERD field row shows. */
  fieldLabels?: ErdFieldRowLabels;
}

/** Derive the layout options once per preference — every node shares them. */
export function nodeLayoutOptions(objectLabels: ObjectLabelsHidden): Required<NodeLayoutOptions> {
  // The field count lives in the status icons row, so the meta row only holds
  // the status pill and the source badge — hiding both drops the whole row.
  return {
    metaRowHidden: objectLabels.source && objectLabels.status,
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
    (metaRowHidden ? -CARD_META_ROW_HEIGHT : 0) + (statusRowHidden ? -CARD_STATUS_ROW_HEIGHT : 0);
  if (viewMode !== 'erd') return COMPACT_NODE_HEIGHT + metaAdjustment;
  const fields = node.fields ?? [];
  if (fields.length === 0) return COMPACT_NODE_HEIGHT + metaAdjustment;
  return ERD_HEADER_HEIGHT + metaAdjustment + erdFieldsBodyHeight(fields, fieldLabels);
}
