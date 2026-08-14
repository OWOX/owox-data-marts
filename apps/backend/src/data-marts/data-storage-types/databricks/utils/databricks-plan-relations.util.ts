/**
 * Extraction of scanned tables from `EXPLAIN EXTENDED` output — Spark's textual plan.
 *
 * The analyzed logical plan names every resolved table as a `Relation <fqn>[columns...]`
 * node, and the physical plan repeats them as `FileScan <format> <fqn>[...]` (Photon
 * warehouses print `PhotonScan`). Views are expanded by the analyzer, so the relations are
 * the base tables. Both shapes are matched — engine variants differ in which sections they
 * print — and the results are deduplicated.
 *
 * Identifier segments may be backticked when they need quoting; backticks are stripped so
 * the caller gets plain fully-qualified names. The legacy `spark_catalog` prefix is dropped
 * to keep names in the `catalog.schema.table` shape the rest of the resolver works with.
 */

const RELATION_RE = /\bRelation\s+((?:`[^`]+`|[\w$]+)(?:\.(?:`[^`]+`|[\w$]+))+)\s*\[/g;
const SCAN_RE =
  /\b(?:Photon)?(?:File)?Scan\s+\w+\s+((?:`[^`]+`|[\w$]+)(?:\.(?:`[^`]+`|[\w$]+))+)\s*\[/g;

export function parseRelationsFromSparkPlan(planText: string): string[] {
  const found = new Set<string>();

  for (const regex of [RELATION_RE, SCAN_RE]) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(planText)) !== null) {
      const name = normalizeRelationName(match[1]);
      if (name) {
        found.add(name);
      }
    }
  }

  return [...found];
}

function normalizeRelationName(raw: string): string | null {
  // Segments are either backticked (may contain dots) or plain; taking them in order is
  // simpler and safer than splitting on dots around backticks.
  const segments = [...raw.matchAll(/`([^`]*)`|([^.`]+)/g)].map(match => match[1] ?? match[2]);
  if (segments.length === 0 || segments.some(segment => segment.length === 0)) {
    return null;
  }
  if (segments[0] === 'spark_catalog') {
    segments.shift();
  }
  if (segments.length < 2) {
    return null;
  }
  return segments.join('.');
}
