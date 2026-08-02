import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import {
  SLEEVE_ROUTED_FUNCTIONS,
  VALUE_SLEEVE_FUNCTIONS,
} from '../../dto/schemas/aggregate-function.schema';
import { AggregationRule } from '../../dto/schemas/aggregation-config.schema';
import { aggregationFunctionsForColumn } from '../../dto/schemas/aggregation-labels';
import {
  BlendedFieldEntry,
  BlendedQueryContext,
  ResolvedRelationshipChain,
} from '../interfaces/blended-query-builder.interface';
import {
  CountDistinctSleeveGroup,
  SleeveFilterOptions,
  ValueSleeveGroup,
} from './blended-query.types';
import { KEPT_GROUPS_CTE } from '../utils/kept-groups.utils';
import {
  MAX_IDENTIFIER_BYTES,
  identifierByteLength,
  truncateIdentifierToByteLimit,
} from '../utils/identifier-limits.utils';

/**
 * Metric-sleeve PLANNING: which report metrics need a sleeve, which chain owns each,
 * how they group into shared dedup passes, and what every resulting CTE is named.
 *
 * Deliberately free of SQL and of any dialect dependency — nothing here quotes an identifier
 * or renders an expression, so it is decided identically for all five warehouses and testable
 * without a builder. The SQL those decisions turn into lives in `metric-sleeve.builder.ts`.
 */

export function collectSleeveMetrics(
  aggregations: AggregationRule[],
  outputAliasToRoot: ReadonlyMap<string, string>
): AggregationRule[] {
  // C2.3: COUNT_DISTINCT and value (SUM/AVG) sleeves both route through this same
  // exclusion machinery — a JOINED (blended) column only; a main-native SUM/AVG has no
  // fan-out to correct for and stays on the normal dedup+re-aggregate path below.
  // SLEEVE_ROUTED_FUNCTIONS is the single source of truth shared with the output-controls
  // validator's HAVING gate — keep them using the same constant so they can't drift.
  return aggregations.filter(
    r => SLEEVE_ROUTED_FUNCTIONS.has(r.function) && outputAliasToRoot.has(r.column)
  );
}

/**
 * C2.1: the chains that own a joined value-sleeve metric whose sleeve READS a per-row identity,
 * each mapped to WHICH identity it uses. Only these chains' `<alias>_raw` CTEs carry it — a
 * declared key means projecting those columns, no key means the `__owox_rid` window; every other
 * raw CTE stays lean. Mirrors `collectSleeveMetrics`'s "blended column only" filter, but resolves
 * through `fieldIndex` (not just `outputAliasToRoot`) to get the owning chain's `cteName` — the
 * same resolution `buildSleeveCte`'s `rawRef` uses for the COUNT_DISTINCT sleeve.
 *
 * gated by `isIdentityPreJoinField` — the SAME check
 * `buildValueSleeveGroupCte` branches on. Only its IDENTITY (raw `ANY_VALUE`
 * passthrough) branch reads a per-row identity; the non-identity branch (the field's own pre-join
 * aggregate — e.g. the DEFAULT joined-SUM shape) keys off the owner dedup CTE's OWN
 * pre-join GROUP KEY instead and needs neither the key nor the surrogate. Before this gate, ANY
 * blended SUM/AVG owner got `__owox_rid` unconditionally, so a non-identity owner's raw CTE
 * carried a per-row `ROW_NUMBER()` window nothing downstream ever read — dead weight, and on some
 * engines a real unpartitioned full-table window computation.
 */
export function collectValueSleeveOwners(
  aggregations: AggregationRule[],
  outputAliasToRoot: ReadonlyMap<string, string>,
  context: BlendedQueryContext
): ReadonlyMap<string, ValueSleeveIdentity> {
  const owners = new Map<string, ValueSleeveIdentity>();
  const fieldIndex = context.fieldIndex;
  if (!fieldIndex) return owners;
  const chainByCte = new Map(context.chains.map(c => [c.cteName, c]));
  for (const r of aggregations) {
    if (!VALUE_SLEEVE_FUNCTIONS.has(r.function)) continue;
    if (!outputAliasToRoot.has(r.column)) continue; // main (non-blended) column
    const entry = fieldIndex.get(r.column);
    if (!entry) {
      // A blended (outputAliasToRoot-mapped) column with no fieldIndex entry is the same
      // invariant violation buildSleeveCte throws on (e.g. a hidden aggregated column that
      // mapOutputAliasesToRoot stamped but buildBlendedFieldIndex skipped). Fail loud here
      // too — silently skipping it would drop the identity its owner chain needs.
      throw new BusinessViolationException(
        `collectValueSleeveOwners: no fieldIndex entry for value-sleeve metric column='${r.column}' ` +
          `(the column is aggregated but missing from the blended field index)`
      );
    }
    if (!isIdentityPreJoinField(r.column, fieldIndex, context)) continue;
    const chain = chainByCte.get(entry.cteName);
    if (!chain) continue; // buildSleeveCte / buildValueSleeveGroupCte report this mismatch
    owners.set(entry.cteName, valueSleeveIdentityFor(chain));
  }
  return owners;
}

/**
 * How a value sleeve tells one row of a joined Data Mart from another.
 *
 * - `primary-key` — the joined mart's OWN declared key. Two rows that agree on the key AND on the
 *   metric's value are then the same owner and are counted once; two rows that agree on the key
 *   but not the value stay separate, so no silent choice is made between contradictory rows.
 * - `row-surrogate` — no key was declared, so every raw row is its own owner (`__owox_rid`).
 *   Correct for well-formed data, but it cannot tell a genuine duplicate row from two distinct
 *   ones, and duplicates are then summed twice.
 */
export type ValueSleeveIdentity =
  | { kind: 'primary-key'; columns: string[] }
  | { kind: 'row-surrogate' };

/**
 * ONE answer to "what identifies a row of this joined mart", read by the raw-CTE builder (which
 * must project those columns, or emit the surrogate window) and by the sleeve builder (which puts
 * them in its DISTINCT tuple). Two independent answers would mean a sleeve deduping on a column
 * its own source CTE never projected.
 *
 * A declared key is TRUSTED, exactly as the main mart's Unique Count trusts it: declaring a key
 * is the statement that it identifies a row. A key that is not in fact unique collapses rows the
 * surrogate kept apart.
 *
 * The non-empty check below is only sound because `targetPrimaryKeyFields` is all-or-nothing —
 * a subset of a composite key looks exactly like a complete key from here, and would silently
 * merge rows the real key distinguishes. The producer owns that rule; see the field's own
 * documentation and `collectPrimaryKeyRowIdentity`.
 */
export function valueSleeveIdentityFor(chain: ResolvedRelationshipChain): ValueSleeveIdentity {
  const declared = chain.targetPrimaryKeyFields ?? [];
  return declared.length > 0
    ? { kind: 'primary-key', columns: [...declared] }
    : { kind: 'row-surrogate' };
}

export function collectReportDimensions(
  columns: string[],
  aggregations: AggregationRule[]
): string[] {
  return columns.filter(c => aggregationFunctionsForColumn(aggregations, c).length === 0);
}

// Sanitize a column path into a legal single identifier (nested-path dots and any other
// non-word char → `_`) for use in a sleeve CTE name.
export function sanitizeSleeveNamePart(part: string): string {
  return part.replace(/[^a-z0-9_]/gi, '_');
}

// The default per-column sleeve CTE name (`sleeve_<col>`). Shared by `buildSleeveCte`'s
// default, the single-column value-group name, and the collision-guard's base-name pass so
// all three agree.
export function sleeveCteNameForColumn(column: string): string {
  return `sleeve_${sanitizeSleeveNamePart(column)}`;
}

/**
 * (C3): whether a blended field's OWN declared pre-join `aggregateFunction`
 * (`chain.blendedFields[].aggregateFunction` — the field's own roll-up to ITS parent
 * join key, NOT a report's post-join metric) is a raw passthrough (`ANY_VALUE` — no real
 * pre-join aggregation happens, e.g. a 1:1 join) or a genuine per-group-key aggregate
 * (COUNT_DISTINCT/SUM/AVG/STRING_AGG/MIN/MAX/COUNT — the "funnel" shape, e.g.
 * `COUNT(DISTINCT hitId)` per session). `getReAggregateFunction` is a DIFFERENT concern
 * (re-rolling an ALREADY-aggregated passthrough value up through a 2+-level transitive
 * blend) and plays no part in this classification. See `buildValueSleeveGroupCte` for why
 * the distinction matters: an identity field's sleeve reads the RAW row (keyed by the
 * per-row `__owox_rid` surrogate); a non-identity field's sleeve must instead read the dedup
 * CTE's ALREADY-aggregated column, keyed by the pre-join GROUP KEY.
 */
export function isIdentityPreJoinField(
  column: string,
  fieldIndex: ReadonlyMap<string, BlendedFieldEntry>,
  context: BlendedQueryContext
): boolean {
  const entry = fieldIndex.get(column);
  const chain = entry && context.chains.find(c => c.cteName === entry.cteName);
  const field = chain?.blendedFields.find(f => f.outputAlias === column);
  // No resolvable declared field defaults to identity — the pre-R2 behaviour every existing
  // fixture already exercises — rather than silently routing an unresolved column onto the
  // (untested for this case) non-identity path.
  return (field?.aggregateFunction ?? 'ANY_VALUE') === 'ANY_VALUE';
}

/**
 * `groupValueSleeveMetrics` merges purely by (owner, dimensions) — it has no notion
 * of a field's pre-join aggregate. Two metrics that share an owner + dims CAN still need
 * DIFFERENT value-sleeve shapes if one field is an identity (`ANY_VALUE`) passthrough and the
 * other is a real pre-join aggregate ( funnel shape): merging them into ONE dedup pass
 * would read the non-identity value off the SAME row set the identity metric dedups by raw
 * row, silently multiplying the non-identity metric's value once per raw row of the identity
 * metric's fan-out. Split any such mixed group back into an identity sub-group and a
 * non-identity sub-group so `buildValueSleeveGroupCte` only ever builds ONE shape per CTE.
 * Groups that are already uniform (the common case — including every group before R2, when
 * every value-sleeve field was necessarily an identity passthrough) pass through unchanged.
 */
export function splitValueSleeveGroupsByIdentity(
  groups: ReadonlyArray<ValueSleeveGroup>,
  context: BlendedQueryContext
): ValueSleeveGroup[] {
  const fieldIndex = context.fieldIndex;
  if (!fieldIndex) return [...groups];
  const result: ValueSleeveGroup[] = [];
  for (const group of groups) {
    const identityMetrics = group.metrics.filter(m =>
      isIdentityPreJoinField(m.column, fieldIndex, context)
    );
    const nonIdentityMetrics = group.metrics.filter(
      m => !isIdentityPreJoinField(m.column, fieldIndex, context)
    );
    if (identityMetrics.length > 0) {
      result.push({
        ownerCteName: group.ownerCteName,
        dimensions: group.dimensions,
        metrics: identityMetrics,
      });
    }
    if (nonIdentityMetrics.length > 0) {
      result.push({
        ownerCteName: group.ownerCteName,
        dimensions: group.dimensions,
        metrics: nonIdentityMetrics,
      });
    }
  }
  return result;
}

// the non-HAVING post-join filter columns (WHERE rules only — HAVING rules carry a
// `function` and are never applied inside a sleeve) whose owning DEDUP CTE the sleeve must
// join so `qualifyColumn` can resolve a blended filter column.
export function sleeveFilterColumns(filterOpts: SleeveFilterOptions): string[] {
  return filterOpts.filters.filter(r => !r.function).map(r => r.column);
}

/**
 * Every column a sleeve must resolve through `qualifyColumn` on top of its own dimensions — i.e.
 * every column whose owning DEDUP CTE the sleeve subquery has to join.
 *
 * That is the post-join filter columns AND the dimensions of the kept-groups restriction: the
 * restriction's join line qualifies each of its dimensions the same way the outer query does, and
 * a Totals sleeve has no dimensions of its own to pull those CTEs in.
 */
export function sleeveJoinColumns(filterOpts: SleeveFilterOptions): string[] {
  return [...sleeveFilterColumns(filterOpts), ...(filterOpts.keptGroups?.dimensions ?? [])];
}

/**
 * 1 review (FIX 1 — defensive): deterministically disambiguate a list of intended
 * sleeve CTE base names so no two collide in one WITH clause. The FIRST occurrence of a name
 * keeps it; every later duplicate gets the smallest `_<n>` suffix (n≥2) that makes it unique.
 *
 * This must NOT rely on field-type governance to prevent collisions. Governance's offered
 * menu never lets a numeric column carry both COUNT_DISTINCT and SUM/AVG, BUT
 * `OutputControlsValidatorService.buildAggregationGovernance` uses a blended field's
 * `postJoinAggregations` override VERBATIM without the `intersectWithSupported` clamp the
 * Totals path applies — so a stale/crafted override could let a REST report request e.g.
 * SUM(X) AND COUNT_DISTINCT(X) on the SAME joined column X. That produces a COUNT_DISTINCT
 * sleeve and a value sleeve both wanting the bare `sleeve_<X>` name (they don't merge — the
 * grouping only spans the value-shaped subset). Without this guard that emits a duplicate CTE name
 * every warehouse rejects. The order it receives names in (COUNT_DISTINCT sleeves first, then
 * value groups) is deterministic, so the disambiguation is stable.
 *
 * `used` must ALSO be seeded with every REAL CTE name already in the WITH
 * clause — `main`, and each chain's own `cteName` (the dedup CTE) plus its `_raw`/`_joined`
 * variants — before any sleeve name is assigned. Without this a sleeve's bare `sleeve_<col>`
 * name could coincidentally equal a real chain CTE name (e.g. a chain whose own `cteName` is
 * literally `sleeve_orders__amount`), and the FIRST occurrence of that name silently keeps it
 * — the sleeve CTE then either fails to parse as a duplicate WITH entry, or (worse, if the
 * dialect tolerates redefinition) shadows/reads the wrong CTE instead of failing loud.
 */
export function disambiguateSleeveCteNames(
  baseNames: ReadonlyArray<string>,
  chains: ReadonlyArray<ResolvedRelationshipChain>
): string[] {
  // Seeded with every name the WITH clause can already hold: `main`, the kept-groups CTE, and
  // each chain's own CTE plus its `_raw`/`_joined` variants.
  const used = new Set<string>(['main', KEPT_GROUPS_CTE]);
  for (const c of chains) {
    used.add(c.cteName);
    used.add(`${c.cteName}_raw`);
    used.add(`${c.cteName}_joined`);
  }
  // Names are kept within the tightest warehouse identifier limit, and the disambiguating suffix
  // is appended to a base already cut to leave room for it. Redshift TRUNCATES an over-long
  // identifier rather than rejecting it, and the suffix sits at the END — so two long sleeve
  // names that differ only past the cut used to come back as one, and the very suffix added to
  // tell them apart was the part thrown away. The limit is applied on every dialect: a CTE name
  // is internal (the metric's output alias is unaffected), so uniform names cost nothing and a
  // per-dialect rule would mean the same report emits different SQL per warehouse.
  return baseNames.map(base => {
    let name = truncateIdentifierToByteLimit(base);
    let n = 2;
    while (used.has(name)) {
      const suffix = `_${n++}`;
      name =
        truncateIdentifierToByteLimit(base, MAX_IDENTIFIER_BYTES - identifierByteLength(suffix)) +
        suffix;
    }
    used.add(name);
    return name;
  });
}

// A short, stable fingerprint of a dimension list, folded into a multi-column value-sleeve
// group's CTE name (1 review FIX 3, defense-in-depth) so two multi-column groups on
// the SAME owner but DIFFERENT dimensions don't both resolve to `sleeve_<owner>_values`.
// Order-sensitive by design: the dimension order is part of the group's identity. Empty for
// a dimensionless (grand-total) group.
export function dimensionsFingerprint(dimensions: readonly string[]): string {
  if (dimensions.length === 0) return '';
  let hash = 5381;
  const joined = dimensions.join('␟');
  for (let i = 0; i < joined.length; i++) {
    hash = ((hash << 5) + hash + joined.charCodeAt(i)) >>> 0; // djb2, unsigned
  }
  return hash.toString(36);
}

/**
 * groups COUNT_DISTINCT sleeve metrics by their OWNER CHAIN.
 *
 * Metrics sharing an owner resolve to the same joins, the same WHERE and the same GROUP BY —
 * only the counted column differs — so one CTE serves all of them with one aggregate each.
 * Without it a Totals report over five joined text columns (COUNT_DISTINCT is a default for
 * string fields) emitted five CTEs, each re-scanning the same sources.
 *
 * Dimensions are report-wide for this shape, so the owner chain is the whole key — unlike a
 * value-sleeve group, whose key also carries its dimensions. Insertion order is preserved so
 * the emitted WITH clause stays deterministic.
 *
 * Lives here, beside its value-sleeve counterpart, because this module is meant to be the single
 * answer to "which sleeves exist, who owns each, and what is it called". It was inline in
 * `MetricSleeveBuilder.buildAll` instead — which made the module's own README false, and meant
 * that adding percentile sleeves, or de-duplicating by a declared primary key, would each have
 * had to reopen the builder to add a grouping rule. Both landed without touching it.
 */
export function groupCountDistinctMetrics(
  metrics: ReadonlyArray<AggregationRule>,
  fieldIndex: ReadonlyMap<string, BlendedFieldEntry> | undefined
): CountDistinctSleeveGroup[] {
  const groups = new Map<string, CountDistinctSleeveGroup>();
  for (const metric of metrics) {
    // Falls back to the column name when the field index cannot resolve it: unlike the value
    // sleeve, this shape does not read the owner's dedup CTE, so an unresolved owner still
    // produces correct (just unmerged) SQL — and a throw here would reject a report the
    // COUNT_DISTINCT path can otherwise serve.
    const owner = fieldIndex?.get(metric.column)?.cteName ?? metric.column;
    const existing = groups.get(owner);
    if (existing) existing.metrics.push(metric);
    else groups.set(owner, { ownerCteName: owner, metrics: [metric] });
  }
  return Array.from(groups.values());
}

/**
 * The CTE name for a COUNT_DISTINCT group: a single-metric group keeps the bare
 * `sleeve_<column>` name its own tests pin (and its SQL byte-identical to the pre-merge form),
 * while a merged group is named after the owner chain it scans.
 */
export function resolveCountDistinctGroupCteName(group: CountDistinctSleeveGroup): string {
  return group.metrics.length === 1
    ? sleeveCteNameForColumn(group.metrics[0].column)
    : `${sleeveCteNameForColumn(group.ownerCteName)}_counts`;
}

/**
 * groups SUM/AVG value-sleeve metrics by `(ownerCte, dimensions)`. Two metrics
 * that share BOTH resolve to the exact same `DISTINCT (dims, owner __owox_rid, value)` dedup set
 * — deduping it twice (one sleeve CTE per metric) would be redundant work, so they're
 * merged into one CTE with one dedup pass and multiple outer aggregates (see
 * `buildValueSleeveGroupCte`). Each entry carries its OWN `dimensions` (rather than a single
 * shared array) so two metrics that need different dimension sets never merge even if they
 * share an owner — in practice `buildBlendedQuery` passes the SAME report-wide `dimensions`
 * to every entry, but the grouping key stays entry-scoped for correctness if that ever
 * changes.
 */
export function groupValueSleeveMetrics(
  entries: ReadonlyArray<{ metric: AggregationRule; dimensions: readonly string[] }>,
  fieldIndex: ReadonlyMap<string, BlendedFieldEntry> | undefined
): ValueSleeveGroup[] {
  const groups = new Map<string, ValueSleeveGroup>();
  for (const { metric, dimensions } of entries) {
    // Invariant: every entry here already passed `collectSleeveMetrics`'s "blended column
    // only" filter, so the real caller always has a populated fieldIndex — mirrors the
    // fail-loud guards `buildSleeveCte`/`collectValueSleeveOwnerCtes` apply for the same
    // reason (a caller that skips the field index dereferences `undefined` blindly instead).
    if (!fieldIndex) {
      throw new Error(
        `groupValueSleeveMetrics: fieldIndex is required to resolve value-sleeve metric ` +
          `column='${metric.column}'`
      );
    }
    const entry = fieldIndex.get(metric.column);
    if (!entry) {
      throw new BusinessViolationException(
        `groupValueSleeveMetrics: no fieldIndex entry for value-sleeve metric column='${metric.column}' ` +
          `(the column is aggregated but missing from the blended field index)`
      );
    }
    const dims = Array.from(dimensions);
    const key = `${entry.cteName}\u241F${dims.join('\u241F')}`;
    const existing = groups.get(key);
    if (existing) {
      existing.metrics.push(metric);
    } else {
      groups.set(key, { ownerCteName: entry.cteName, dimensions: dims, metrics: [metric] });
    }
  }
  return Array.from(groups.values());
}

/**
 * deterministic CTE name for a merged value-sleeve group. A group whose metrics
 * ALL target the SAME value column (e.g. a Totals report's auto SUM + AVG on one numeric
 * joined field) keeps the existing bare `sleeve_<col>` shape — the single-metric-per-column
 * convention `buildSleeveCte`'s own tests pin. A group spanning MULTIPLE distinct columns of
 * the same owner (e.g. two different SUM metrics) has no single column to key on, so it's
 * named after its owner chain plus a short dimensions fingerprint — the fingerprint keeps two
 * multi-column groups on the same owner but different dimensions from colliding (defense-in-
 * depth: `buildBlendedQuery` passes one shared dimensions array today, and the collision
 * guard in `disambiguateSleeveCteNames` would catch any residual clash regardless).
 */
export function resolveValueSleeveGroupCteName(group: ValueSleeveGroup): string {
  const distinctColumns = Array.from(new Set(group.metrics.map(m => m.column)));
  if (distinctColumns.length === 1) {
    return sleeveCteNameForColumn(distinctColumns[0]);
  }
  const fp = dimensionsFingerprint(group.dimensions);
  return `sleeve_${sanitizeSleeveNamePart(group.ownerCteName)}_values${fp ? `_${fp}` : ''}`;
}
