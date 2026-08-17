/**
 * Extraction of input tables from `EXPLAIN (TYPE IO, FORMAT JSON)` output.
 *
 * The IO plan is Athena's structured answer to "which tables does this query read" — the
 * equivalent of BigQuery's `referencedTables`, with views (Athena views are engine views)
 * already expanded down to base tables. The documented shape is:
 *
 * ```json
 * { "inputTableColumnInfos": [
 *     { "table": { "catalog": "awsdatacatalog",
 *                  "schemaTable": { "schema": "sampledb", "table": "elb_logs" } },
 *       "columnConstraints": [...] } ],
 *   "outputTable": ... }
 * ```
 *
 * Rather than binding to that exact nesting — engine versions differ in the surrounding
 * structure — the parser walks the whole JSON tree and collects every
 * `{schema, table}` pair it finds, taking the nearest enclosing `catalog` along the way.
 * The output table of a SELECT does not exist in the plan, so everything found is an input.
 */

export interface AthenaInputTableRef {
  catalog: string | null;
  schema: string;
  table: string;
}

/**
 * Parses the raw EXPLAIN output into the set of input tables, deduplicated. Returns [] for
 * anything unrecognisable — the caller logs the raw plan so a format drift is observable.
 */
export function parseInputTablesFromIoPlan(planText: string): AthenaInputTableRef[] {
  const jsonStart = planText.indexOf('{');
  if (jsonStart === -1) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(planText.slice(jsonStart));
  } catch {
    return [];
  }

  const found = new Map<string, AthenaInputTableRef>();
  walk(parsed, null, found);
  return [...found.values()];
}

function walk(
  node: unknown,
  catalog: string | null,
  found: Map<string, AthenaInputTableRef>
): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      walk(item, catalog, found);
    }
    return;
  }
  if (node === null || typeof node !== 'object') {
    return;
  }

  const record = node as Record<string, unknown>;
  const ownCatalog = typeof record.catalog === 'string' ? record.catalog : catalog;

  if (typeof record.schema === 'string' && typeof record.table === 'string') {
    const ref: AthenaInputTableRef = {
      catalog: ownCatalog,
      schema: record.schema,
      table: record.table,
    };
    found.set(`${ref.catalog ?? ''}\0${ref.schema}\0${ref.table}`, ref);
    return;
  }

  for (const value of Object.values(record)) {
    walk(value, ownCatalog, found);
  }
}
