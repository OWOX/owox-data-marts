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
  JoinedUniqueCountSleeve,
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
 * The chains whose sleeve reads a per-row identity, each mapped to WHICH identity — so only those
 * `<alias>_raw` CTEs carry it and every other stays lean. Gated by `isIdentityPreJoinField`, the
 * same check `buildValueSleeveGroupCte` branches on: a non-identity owner keys off its dedup CTE's
 * own group key and needs neither the declared key nor the surrogate window.
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
      // Skipping it silently would drop the identity its owner chain needs.
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

export type ValueSleeveIdentity =
  | { kind: 'primary-key'; columns: string[] }
  | { kind: 'row-surrogate' };

/**
 * One answer for both the raw-CTE builder (which projects the columns) and the sleeve builder
 * (which dedups on them). The declared key is trusted, as Unique Count trusts it; the non-empty
 * check is only sound because `targetPrimaryKeyFields` is all-or-nothing.
 */
export function valueSleeveIdentityFor(chain: ResolvedRelationshipChain): ValueSleeveIdentity {
  const declared = chain.targetPrimaryKeyFields ?? [];
  return declared.length > 0
    ? { kind: 'primary-key', columns: [...declared] }
    : { kind: 'row-surrogate' };
}

/**
 * Which of an owner's join-key columns still need a slot of their own in a sleeve's `SELECT
 * DISTINCT` identity, given the declared-key columns that already have one. The join key SCOPES a
 * key declared unique only within it (`line_no` per order); a join key the declared key already
 * carries scopes nothing, because `SELECT DISTINCT … user_id, user_id` is the same set as
 * `SELECT DISTINCT … user_id` — and a real primary key determines the join key, so that is the
 * common case.
 *
 * Matched on the EXACT column name, as `collectSubsidiaryReferences` matches two references to one
 * projected column: two names differing only in case are two distinct quoted identifiers on
 * Snowflake, and treating them as one would drop a slot that scopes the key by a column the key
 * does not carry — silently narrowing the identity.
 */
export function identityScopingJoinKeyColumns(
  keyColumns: readonly string[],
  joinKeyColumns: readonly string[]
): string[] {
  const declared = new Set(keyColumns);
  return joinKeyColumns.filter(col => !declared.has(col));
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
 * The CTE base name for a joined source's Unique Count sleeve. Derived from the alias path rather
 * than a metric column, because this sleeve has no column — it counts a declared key.
 */
export function uniqueCountSleeveCteName(source: JoinedUniqueCountSleeve): string {
  return `sleeve_uc_${sanitizeSleeveNamePart(source.aliasPath)}`;
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
 * Splits any value-sleeve group mixing an identity (`ANY_VALUE`) passthrough field with a real
 * pre-join aggregate ( funnel shape) into an identity and a non-identity sub-group, so
 * `buildValueSleeveGroupCte` only ever builds ONE shape per CTE: merging the two into one dedup
 * pass would read the non-identity value off the SAME row set the identity metric dedups by raw
 * row, silently multiplying it once per raw row of that fan-out.
 *
 * A guard rather than a routing step — `groupValueSleeveMetrics` keys on the metric column and
 * the classification is a property of that column, so every group it produces is already
 * uniform and passes through unchanged.
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
 * value groups, then joined Unique Counts) is deterministic, so the disambiguation is stable.
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

/**
 * groups COUNT_DISTINCT sleeve metrics by their OWNER CHAIN.
 *
 * Metrics sharing an owner resolve to the same joins, the same WHERE and the same GROUP BY —
 * only the counted column differs — so one CTE serves all of them with one aggregate each.
 * Without it a Totals report over five joined text columns (COUNT_DISTINCT is a default for
 * string fields) emitted five CTEs, each re-scanning the same sources.
 *
 * Dimensions are report-wide for this shape and the counted column is an argument rather than a
 * deduped tuple slot, so the owner chain is the whole key — unlike a value-sleeve group, whose
 * key also carries its column and its dimensions. Insertion order is preserved so the emitted
 * WITH clause stays deterministic.
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
 * groups value-sleeve metrics by `(ownerCte, column, dimensions)`. Metrics sharing all three
 * resolve to the exact same `DISTINCT (dims, owner identity, value)` dedup set, so SUM + AVG +
 * percentile + STRING_AGG on ONE column share a single dedup pass with several outer aggregates
 * (see `buildValueSleeveGroupCte`) instead of one CTE each.
 *
 * The COLUMN is part of the key because `DISTINCT` spans the whole projected tuple: with two
 * metric columns in one pass, a difference in either is a difference in the dedup set — so under
 * a declared-primary-key identity, where duplicate raw rows are meant to collapse, a second
 * column's variation keeps them apart and inflates the first column's aggregate.
 *
 * Each entry carries its OWN `dimensions` (rather than a single shared array) so two metrics
 * that need different dimension sets never merge even if they share an owner — in practice
 * `buildBlendedQuery` passes the SAME report-wide `dimensions` to every entry, but the grouping
 * key stays entry-scoped for correctness if that ever changes.
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
    const key = `${entry.cteName}\u241F${metric.column}\u241F${dims.join('\u241F')}`;
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
 * deterministic CTE name for a value-sleeve group. Every group targets exactly ONE value column
 * (`groupValueSleeveMetrics` keys on it), so the bare `sleeve_<col>` shape names it — the
 * single-metric-per-column convention `buildSleeveCte`'s own tests pin. Two groups on the same
 * column but different dimensions therefore want the same name; `disambiguateSleeveCteNames`
 * is what keeps them apart.
 */
export function resolveValueSleeveGroupCteName(group: ValueSleeveGroup): string {
  const distinctColumns = Array.from(new Set(group.metrics.map(m => m.column)));
  if (distinctColumns.length !== 1) {
    throw new Error(
      `resolveValueSleeveGroupCteName: value-sleeve group for owner cteName=` +
        `'${group.ownerCteName}' carries column(s) [${distinctColumns.join(', ')}] — a group ` +
        `holds exactly one, so any name derived from it would misname the rest`
    );
  }
  return sleeveCteNameForColumn(distinctColumns[0]);
}
