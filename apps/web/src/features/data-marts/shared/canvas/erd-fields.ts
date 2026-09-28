/**
 * A single field rendered as a row inside an ERD card, shared by the Models
 * canvas nodes and the Joinable Data Marts diagram nodes.
 */
export interface ErdCardField {
  name: string;
  /** Human-friendly alias (businessName / displayName) when set, else the raw name. */
  alias: string;
  type: string;
  /** Business description from the Output Schema — an optional row line, and exported. */
  description?: string;
  isPrimaryKey: boolean;
  /** Hidden-for-reporting fields (usually surrogate join keys). */
  isHidden: boolean;
}

/**
 * The Detailed-view half of the object-labels preference (see object-labels.ts):
 * what an ERD field row shows besides the type.
 */
export interface ErdFieldRowLabels {
  /** Lead the row with the Output Schema alias (when set) instead of the technical name. */
  alias: boolean;
  /** Add the Output Schema description, when set, as a line under the name. */
  description: boolean;
}

export const ALL_FIELD_ROW_LABELS: ErdFieldRowLabels = { alias: true, description: true };

/** ERD card width — one value for every canvas that renders ErdCardFieldsSection. */
export const ERD_NODE_WIDTH = 256;
export const ERD_ROW_HEIGHT = 26;
/** Height of the optional description line rendered under a field name. */
export const ERD_ROW_EXTRA_LINE_HEIGHT = 14;
export const ERD_EXPAND_ROW_HEIGHT = 26;
/** ERD cards show at most this many rows before collapsing behind a toggle. */
export const ERD_COLLAPSED_ROWS = 4;

/** Primary keys first, then the rest — stable order, collapsed or expanded. */
export function orderFields(fields: ErdCardField[]): ErdCardField[] {
  return [...fields.filter(f => f.isPrimaryKey), ...fields.filter(f => !f.isPrimaryKey)];
}

/**
 * How many rows an ERD card shows when collapsed. Primary keys always stay
 * visible — they identify the mart and anchor joins conceptually — so a
 * key-heavy mart can exceed the base cap.
 */
export function collapsedRowCount(fields: ErdCardField[]): number {
  const keyCount = fields.filter(f => f.isPrimaryKey).length;
  return Math.min(fields.length, Math.max(ERD_COLLAPSED_ROWS, keyCount));
}

/** True when the alias carries information beyond the technical name (whitespace aside). */
export function hasDistinctAlias(field: ErdCardField): boolean {
  return field.alias.trim() !== field.name.trim();
}

/** The row's leading text: the alias when that label is on, else the technical name. */
export function fieldRowLabel(field: ErdCardField, labels: ErdFieldRowLabels): string {
  return labels.alias && hasDistinctAlias(field) ? field.alias : field.name;
}

export function fieldDescriptionLine(
  field: ErdCardField,
  labels: ErdFieldRowLabels
): string | null {
  return labels.description && field.description?.trim() ? field.description : null;
}

/**
 * Height of one field row: the name line plus the description line when it is
 * shown for this field. Both are single-line (truncated), so the height depends
 * only on whether the description is present — the layout can size the card
 * before render.
 */
export function erdRowHeight(field: ErdCardField, labels: ErdFieldRowLabels): number {
  return ERD_ROW_HEIGHT + (fieldDescriptionLine(field, labels) ? ERD_ROW_EXTRA_LINE_HEIGHT : 0);
}

/**
 * Collapsed height of the ErdCardFieldsSection body (rows + the "+N more"
 * toggle). Lives here so every canvas that renders the section reserves the
 * same space in its layout — each canvas adds only its own header height.
 */
export function erdFieldsBodyHeight(
  fields: ErdCardField[],
  labels: ErdFieldRowLabels = ALL_FIELD_ROW_LABELS
): number {
  if (fields.length === 0) return 0;
  const rows = collapsedRowCount(fields);
  const hasMore = fields.length > rows;
  const visible = orderFields(fields).slice(0, rows);
  const rowsHeight = visible.reduce((sum, field) => sum + erdRowHeight(field, labels), 0);
  return rowsHeight + (hasMore ? ERD_EXPAND_ROW_HEIGHT : 0);
}
