// Escaping contract: \\ first, then \t/\n/\r — embedded control chars must not
// create phantom columns or rows when the consumer splits on tab/newline.

export const ROWS_PAYLOAD_BYTE_CAP = 131072; // 128 KiB — safety ceiling for the serialized rows payload.
// Comfortably above a max-limit (1000) narrow result (~56 KB), so normal queries pass untouched;
// only pathological wide-value payloads get trimmed (then `truncated: true`).

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
  return s.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

export function serializeTsvWithByteCap(
  columns: string[],
  rows: unknown[][],
  maxBytes: number
): { tsv: string; rowCount: number; capped: boolean } {
  const header = columns.join('\t');
  let total = Buffer.byteLength(header, 'utf8');
  const lines = [header];
  let count = 0;
  for (const r of rows) {
    const line = r.map(cell).join('\t');
    const add = Buffer.byteLength('\n' + line, 'utf8');
    if (count > 0 && total + add > maxBytes) break; // always keep at least the first row
    total += add;
    lines.push(line);
    count++;
  }
  return { tsv: lines.join('\n'), rowCount: count, capped: count < rows.length };
}

export function serializeTsv(columns: string[], rows: unknown[][]): string {
  return serializeTsvWithByteCap(columns, rows, Number.POSITIVE_INFINITY).tsv;
}
