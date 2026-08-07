/**
 * A single field rendered as a row inside an ERD card, shared by the Models
 * canvas nodes and the Joinable Data Marts diagram nodes.
 */
export interface ErdCardField {
  name: string;
  /** Human-friendly alias (businessName / displayName) when set, else the raw name. */
  alias: string;
  type: string;
  /** Business description from the Output Schema — exported, not rendered on the card. */
  description?: string;
  isPrimaryKey: boolean;
  /** Hidden-for-reporting fields (usually surrogate join keys). */
  isHidden: boolean;
}

export const ERD_ROW_HEIGHT = 26;
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
