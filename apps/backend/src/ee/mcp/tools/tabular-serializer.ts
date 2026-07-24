// Escaping contract: \\ first, then \t/\n/\r — embedded control chars must not
// create phantom columns or rows when the consumer splits on tab/newline.

export const ROWS_PAYLOAD_BYTE_CAP = 131072; // 128 KiB — hard ceiling for the serialized rows payload.
// Comfortably above a max-limit (1000) narrow result (~56 KB), so normal queries pass untouched.
// The ceiling is hard: a pathological row that alone exceeds it is dropped (not emitted in full),
// and the result is flagged `capped` (→ `truncated: true`) so the caller narrows the query.

export interface TsvColumnLabel {
  /** Stable technical name used to disambiguate a duplicate display label. */
  name: string;
  /** Business-facing label supplied by the query header. */
  displayName: string;
}

function escapeTsvText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\t/g, '\\t')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

/**
 * Produces non-empty, unambiguous labels for a tabular result. Schema aliases are optional and
 * user-controlled, so blanks fall back to the technical name and duplicates carry that name.
 */
export function formatTsvColumnLabels(columns: readonly TsvColumnLabel[]): string[] {
  const baseLabels = columns.map(column => column.displayName.trim() || column.name);
  const labelCounts = new Map<string, number>();
  for (const label of baseLabels) {
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }

  const usedLabels = new Set<string>();
  return baseLabels.map((label, index) => {
    const column = columns[index];
    const candidate = (labelCounts.get(label) ?? 0) > 1 ? `${label} (${column.name})` : label;
    let result = candidate;
    let collisionNumber = 2;
    while (usedLabels.has(result)) {
      result = `${candidate} [${column.name} ${collisionNumber}]`;
      collisionNumber++;
    }
    usedLabels.add(result);
    return result;
  });
}

// JSON.stringify throws on a nested BigInt (TypeError) or a circular reference. A struct/array cell
// can carry a BigInt warehouse value (e.g. BigQuery INT64 inside a RECORD), and that throw would
// happen AFTER the query ran and was billed — surfacing as a misleading generic error. Encode
// BigInt as its decimal string and fall back to String(v) if stringify still throws.
function stringifyObjectCell(v: object): string {
  try {
    return JSON.stringify(v, (_key, val) => (typeof val === 'bigint' ? val.toString() : val));
  } catch {
    return String(v);
  }
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  // RECORD/STRUCT/ARRAY warehouse cells are objects — String() would emit "[object Object]".
  // JSON-encode them so the LLM sees the actual value. Date keeps its String() form to preserve
  // the existing timestamp rendering.
  const s = typeof v === 'object' && !(v instanceof Date) ? stringifyObjectCell(v) : String(v);
  return escapeTsvText(s);
}

export function serializeTsvWithByteCap(
  columns: string[],
  rows: unknown[][],
  maxBytes: number
): { tsv: string; headerColumns: string[]; rowCount: number; capped: boolean } {
  // Header labels are user-controlled aliases too. Escape them using the same contract as cells
  // so tabs/newlines cannot create phantom TSV columns or rows.
  const headerColumns = columns.map(escapeTsvText);
  const header = headerColumns.join('\t');
  let total = Buffer.byteLength(header, 'utf8');
  const lines = [header];
  let count = 0;
  for (const r of rows) {
    const line = r.map(cell).join('\t');
    const add = Buffer.byteLength(line, 'utf8') + 1; // +1 for the '\n' separator (always 1 byte in UTF-8)
    // Hard ceiling: drop the row rather than emit past maxBytes — even the first row, so a single
    // oversized warehouse value cannot blow the payload. An empty result is flagged `capped`.
    if (total + add > maxBytes) break;
    total += add;
    lines.push(line);
    count++;
  }
  return { tsv: lines.join('\n'), headerColumns, rowCount: count, capped: count < rows.length };
}

export function serializeTsv(columns: string[], rows: unknown[][]): string {
  return serializeTsvWithByteCap(columns, rows, Number.POSITIVE_INFINITY).tsv;
}
