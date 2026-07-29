import { DataMartDefinitionType } from '../../shared/enums/data-mart-definition-type.enum';
import type { CanvasNodeField, ModelCanvasNode } from './types';

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
// Node height must be a pure function of its data so the dagre layout (which is
// computed before render) and the rendered node agree exactly — otherwise edge
// anchors drift. The "+N more" affordance therefore opens the Data Mart instead
// of expanding in place, keeping every node height deterministic.

export const ERD_NODE_WIDTH = 264;
export const ERD_HEADER_HEIGHT = 58; // title row + meta row (badge + field count)
export const ERD_ROW_HEIGHT = 26;
export const ERD_MORE_ROW_HEIGHT = 26;
export const ERD_MAX_VISIBLE_ROWS = 8;
/** Height of a node when its fields have not been loaded yet (compact fallback). */
export const ERD_COMPACT_HEIGHT = 74;

/** Primary keys first, then the rest — stable order, collapsed or not. */
export function orderFields(fields: CanvasNodeField[]): CanvasNodeField[] {
  return [...fields.filter(f => f.isPrimaryKey), ...fields.filter(f => !f.isPrimaryKey)];
}

export function visibleFieldCount(total: number): number {
  return Math.min(total, ERD_MAX_VISIBLE_ROWS);
}

/** Deterministic rendered height for a node, used both for layout and render. */
export function computeNodeHeight(node: Pick<ModelCanvasNode, 'fields' | 'fieldCount'>): number {
  const fields = node.fields;
  if (!fields || fields.length === 0) {
    // No schema loaded (or a genuinely field-less mart) → compact card.
    return ERD_COMPACT_HEIGHT;
  }
  const visible = visibleFieldCount(fields.length);
  const hasMore = fields.length > visible;
  return ERD_HEADER_HEIGHT + visible * ERD_ROW_HEIGHT + (hasMore ? ERD_MORE_ROW_HEIGHT : 0);
}
