// Escaping contract: \\ first, then \t/\n/\r — embedded control chars must not
// create phantom columns or rows when the consumer splits on tab/newline.

export const ROWS_PAYLOAD_BYTE_CAP = 131072; // 128 KiB — safety ceiling for the serialized rows payload.
// Comfortably above a max-limit (1000) narrow result (~56 KB), so normal queries pass untouched;
// only pathological wide-value payloads get trimmed (then `truncated: true`).

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/\\/g, '\\\\')
    .replace(/\t/g, '\\t')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
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
