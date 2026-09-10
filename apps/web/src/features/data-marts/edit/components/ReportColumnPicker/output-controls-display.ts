/**
 * The advice under the picker's "Disconnected columns" block, word for word the message of
 * `apps/backend/src/data-marts/errors/disconnected-report-columns.error.ts`. The block and the
 * save error describe one state, and a filter, sort, aggregation or date bucket on such a column
 * is refused by that same error — so the block has to send the reader to the same fix, rules
 * included, or the save fails on a rule the block never mentioned.
 */
export const DISCONNECTED_COLUMNS_ADVICE =
  'They are missing from the current Data Mart output schema. Uncheck them and remove any ' +
  'filter, sort, aggregation or date bucket rule that references them, or contact your analyst ' +
  'to restore the schema.';

/** Last dotted segment of a flattened field name: `a.b.c` → `c`. */
export function fieldLeafName(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? name : name.slice(i + 1);
}

/**
 * Business-readable label for a field option. Prefers a human-set alias;
 * otherwise the leaf of `basis` — the dotted path for native fields, or the
 * already-leaf original field name for blended fields.
 */
export function fieldDisplayLabel(alias: string | undefined, basis: string): string {
  const trimmed = alias?.trim() ?? '';
  return trimmed !== '' ? trimmed : fieldLeafName(basis);
}
