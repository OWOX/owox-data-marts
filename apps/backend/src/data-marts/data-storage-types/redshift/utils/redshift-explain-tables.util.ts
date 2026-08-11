/**
 * Extraction of scanned tables from `EXPLAIN` plan text.
 *
 * Redshift has no BigQuery-style `referencedTables` metadata, but its planner output carries the
 * same information: every base table the query reads appears as a scan node, with views (regular
 * and late-binding) already expanded away. Two node shapes matter:
 *
 * - `XN Seq Scan on sales s  (cost=…)`         — a local table; NOTE the name is printed
 *   WITHOUT its schema (a PostgreSQL-8 inheritance), so callers must map it back to a schema
 *   through the catalog before they can look its metadata up.
 * - `S3 Seq Scan spectrum.sales location:…`     — a Spectrum external table, schema-qualified.
 *
 * Anything else (subquery scans, joins, network nodes) never carries a base-table name.
 */

/** One scanned table; `parts` are unquoted name segments, e.g. `['sales']` or `['spectrum','sales']`. */
export interface RedshiftScannedTableRef {
  parts: string[];
}

export interface RedshiftScannedTables {
  /** Local table scans, deduplicated, in plan order. Names are schema-less — see module doc. */
  local: RedshiftScannedTableRef[];
  /** Spectrum (external) table scans, deduplicated. */
  external: RedshiftScannedTableRef[];
}

/** A possibly-quoted identifier segment: `sales`, `"Mixed Case"`, `"with""quote"`. */
const IDENTIFIER_SEGMENT = '(?:"[^"]*(?:""[^"]*)*"|[^\\s".]+)';
const QUALIFIED_NAME = `${IDENTIFIER_SEGMENT}(?:\\.${IDENTIFIER_SEGMENT}){0,2}`;

const LOCAL_SCAN_RE = new RegExp(`\\bSeq Scan on\\s+(${QUALIFIED_NAME})`);
const EXTERNAL_SCAN_RE = new RegExp(`\\bS3 Seq Scan\\s+(${QUALIFIED_NAME})`);

/**
 * Planner-internal working tables (`volt_tt_…` temporaries, other `volt_…` artifacts) that can
 * appear as scans in rewritten plans. They are not user data sources and carry no meaning for
 * "when did the data change".
 */
const INTERNAL_TABLE_PREFIX = 'volt_';

/**
 * A materialized view's storage is a real table named `mv_tbl__<view>__<n>`; querying the view
 * scans that table. Its modification time IS meaningful (it is the last refresh), but the name
 * is internal, so callers rename the entry back to the view for display.
 */
const MV_BACKING_TABLE_RE = /^mv_tbl__(.+)__\d+$/;

export function materializedViewNameFromBackingTable(tableName: string): string | null {
  return MV_BACKING_TABLE_RE.exec(tableName)?.[1] ?? null;
}

/** Parses the plan rows of `EXPLAIN <query>` into the sets of scanned local and external tables. */
export function parseScannedTablesFromPlan(planLines: string[]): RedshiftScannedTables {
  const local = new Map<string, RedshiftScannedTableRef>();
  const external = new Map<string, RedshiftScannedTableRef>();

  for (const line of planLines) {
    const externalMatch = EXTERNAL_SCAN_RE.exec(line);
    if (externalMatch) {
      addRef(external, externalMatch[1]);
      continue;
    }

    const localMatch = LOCAL_SCAN_RE.exec(line);
    if (localMatch) {
      const ref = toRef(localMatch[1]);
      if (!ref.parts[ref.parts.length - 1].startsWith(INTERNAL_TABLE_PREFIX)) {
        addRef(local, localMatch[1]);
      }
    }
  }

  return { local: [...local.values()], external: [...external.values()] };
}

function addRef(target: Map<string, RedshiftScannedTableRef>, rawName: string): void {
  const ref = toRef(rawName);
  const key = ref.parts.join('\0');
  if (!target.has(key)) {
    target.set(key, ref);
  }
}

function toRef(rawName: string): RedshiftScannedTableRef {
  const parts = (rawName.match(new RegExp(IDENTIFIER_SEGMENT, 'g')) ?? []).map(unquoteSegment);
  return { parts };
}

function unquoteSegment(segment: string): string {
  if (segment.startsWith('"') && segment.endsWith('"')) {
    return segment.slice(1, -1).replace(/""/g, '"');
  }
  return segment;
}
