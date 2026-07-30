import { DataMartDefinitionType } from '../../shared/enums/data-mart-definition-type.enum';
import type { CanvasNodeField, ModelCanvasNode } from './types';

/** Canvas node display density. Compact = header only; ERD = header + field rows. */
export type CanvasViewMode = 'compact' | 'erd';

/**
 * Accent / badge color per definition type, mirroring the OWOX Model Canvas
 * palette (owox/models). Kept in one place so the header stripe, the badge and
 * the minimap dot stay in sync.
 */
export const DEFINITION_TYPE_ACCENT: Partial<Record<DataMartDefinitionType, string>> = {
  [DataMartDefinitionType.SQL]: '#10b981', // emerald
  [DataMartDefinitionType.VIEW]: '#3b82f6', // blue
  [DataMartDefinitionType.TABLE]: '#8b5cf6', // violet
  [DataMartDefinitionType.TABLE_PATTERN]: '#ec4899', // pink
  [DataMartDefinitionType.CONNECTOR]: '#f59e0b', // amber
};

export const DEFINITION_TYPE_FALLBACK_ACCENT = '#94a3b8'; // slate

export function definitionTypeAccent(type: DataMartDefinitionType | null | undefined): string {
  return type
    ? (DEFINITION_TYPE_ACCENT[type] ?? DEFINITION_TYPE_FALLBACK_ACCENT)
    : DEFINITION_TYPE_FALLBACK_ACCENT;
}

// ---- Layout geometry -------------------------------------------------------
// The dagre layout runs before render, so it needs a size estimate per node.
// It always sizes to the COLLAPSED height: the default picture stays tidy, and
// an expanded ERD node may overlap below until the user drags it (nodes are
// draggable) — same behaviour as owox/models.

export const COMPACT_NODE_WIDTH = 212;
export const COMPACT_NODE_HEIGHT = 92;

export const ERD_NODE_WIDTH = 256;
export const ERD_HEADER_HEIGHT = 64; // title row + meta row (badge + field count)
export const ERD_ROW_HEIGHT = 26;
export const ERD_EXPAND_ROW_HEIGHT = 26;
/** ERD nodes show at most this many rows before collapsing behind a toggle. */
export const ERD_COLLAPSED_ROWS = 4;

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

/** Collapsed layout height for a node, used by dagre and as the initial render size. */
export function computeNodeHeight(
  node: Pick<ModelCanvasNode, 'fields'>,
  viewMode: CanvasViewMode
): number {
  if (viewMode !== 'erd') return COMPACT_NODE_HEIGHT;
  const fields = node.fields ?? [];
  if (fields.length === 0) return COMPACT_NODE_HEIGHT;
  const rows = collapsedRowCount(fields);
  const hasMore = fields.length > rows;
  return ERD_HEADER_HEIGHT + rows * ERD_ROW_HEIGHT + (hasMore ? ERD_EXPAND_ROW_HEIGHT : 0);
}
