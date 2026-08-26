import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import type {
  FormulaAggregateCall,
  FormulaOwnerPlan,
} from '../../calculated-fields/formula-owner-plan';
import { scanSql, type SqlToken } from '../../calculated-fields/sql-token-scanner';
import {
  SLEEVE_ROUTED_FUNCTIONS,
  VALUE_SLEEVE_FUNCTIONS,
} from '../../dto/schemas/aggregate-function.schema';
import { AggregationRule } from '../../dto/schemas/aggregation-config.schema';
import { aggregationFunctionsForColumn } from '../../dto/schemas/aggregation-labels';
import { tryAliasPathToCteName } from '../../dto/schemas/filter-config.schema';
import { isWhereFilterRule } from '../../dto/domain/filter-clause';
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
 * Metric-sleeve PLANNING: which metrics need a sleeve, which chain owns each, how they group into
 * shared dedup passes and what every resulting CTE is named.
 *
 * Free of SQL and of any dialect dependency, so it is decided identically for all five warehouses
 * and testable without a builder. A formula's LEXICAL structure is read — where one argument ends
 * and the next begins — but never a function's signature or semantics.
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
 * The chains whose sleeve reads a per-row identity, each mapped to WHICH identity, so only those
 * `<alias>_raw` CTEs carry it. A non-identity owner keys off its dedup CTE's own group key and
 * needs neither the declared key nor the surrogate window.
 *
 * Formula sleeves are keyed by an aggregate CALL rather than an `AggregationRule`, so the
 * aggregations pass cannot see them — without this a formula sleeve would reference a surrogate its
 * own `<alias>_raw` never projected, which no guard downstream detects. Pass only those the caller
 * classified as reading RAW, or `__owox_rid` puts a full `ROW_NUMBER() OVER (PARTITION BY …)` over
 * the joined mart for a column nothing reads.
 */
export function collectValueSleeveOwners(
  aggregations: AggregationRule[],
  outputAliasToRoot: ReadonlyMap<string, string>,
  context: BlendedQueryContext,
  formulaSleeves: ReadonlyArray<FormulaSleevePlan> = []
): ReadonlyMap<string, ValueSleeveIdentity> {
  const owners = new Map<string, ValueSleeveIdentity>();
  const chainByCte = new Map(context.chains.map(c => [c.cteName, c]));
  // Ahead of the field-index guard below: a formula sleeve's owner is named by the CHAIN, not by a
  // metric column, so it is resolvable with no field index at all — and returning early without it
  // would emit a sleeve reading a surrogate its own `<alias>_raw` never projected.
  for (const plan of formulaSleeves) {
    const chain = chainByCte.get(plan.ownerCteName);
    if (!chain) continue; // buildFormulaSleeveCte reports this mismatch, naming the calculation
    owners.set(plan.ownerCteName, valueSleeveIdentityFor(chain));
  }
  const fieldIndex = context.fieldIndex;
  if (!fieldIndex) return owners;
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
 * DISTINCT` identity. The join key SCOPES a key declared unique only within it (`line_no` per
 * order); one the declared key already carries scopes nothing.
 *
 * Matched on the EXACT column name: two names differing only in case are two distinct quoted
 * identifiers on Snowflake, and treating them as one would silently narrow the identity.
 */
export function identityScopingJoinKeyColumns(
  keyColumns: readonly string[],
  joinKeyColumns: readonly string[]
): string[] {
  const declared = new Set(keyColumns);
  return joinKeyColumns.filter(col => !declared.has(col));
}

/**
 * The report's grouping keys as a sleeve sees them: every selected column carrying no aggregation
 * of its own, then every calculated field that is a GROUPING KEY.
 *
 * The calculated names arrive on a list of their own, because the composer strips them out of
 * `columns` before the builder is reached, and they are APPENDED so the grain lands in the order
 * `renderAggregatedSelect` emits `groupByParts`: column keys first, then calculated ones.
 */
export function collectReportDimensions(
  columns: string[],
  aggregations: AggregationRule[],
  calculatedDimensionNames: readonly string[] = []
): string[] {
  return [
    ...columns.filter(c => aggregationFunctionsForColumn(aggregations, c).length === 0),
    ...calculatedDimensionNames,
  ];
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
 * One aggregate call of a calculated field's formula that reads a JOINED Data Mart, and therefore
 * needs its own sleeve: the blended query aggregates each joined source by its join key BEFORE
 * joining it in, so the outer SELECT cannot recompute `SUM(orders.amount)` from that collapsed CTE
 * without over- or under-counting on a fanning join.
 *
 * v1 is one sleeve per CALL with no merging — which is also why this sidesteps
 * `groupValueSleeveMetrics`' multi-column hazard entirely: the key is the call, not a column.
 */
export interface FormulaSleevePlan {
  /** Output name of the calculated field whose formula this call belongs to. */
  metricOutputName: string;
  /** Index of the call in that metric's own `FormulaOwnerPlan.calls` — own-owner calls included. */
  callIndex: number;
  /** The call itself: `fn`, its `[start, end)` span in the STORED formula, and its refs. */
  call: FormulaAggregateCall;
  /** The joined source's alias path as authored (`orders`, `users.address`). */
  aliasPath: string;
  /** That source's chain CTE name — the sleeve reads `<ownerCteName>_raw`. */
  ownerCteName: string;
  /** Intended CTE name, BEFORE `disambiguateSleeveCteNames` resolves it against the full set. */
  baseCteName: string;
  /** Output alias of the single pull this sleeve feeds. */
  pullAlias: string;
  /**
   * True when the argument opens with the ANSI `DISTINCT` quantifier (`COUNT(DISTINCT x)`). It is a
   * keyword of the CALL, not part of its argument: left in the sleeve's inner slot it emits
   * `DISTINCT <expr> AS _val`, which no warehouse parses. It belongs on the OUTER aggregate.
   */
  distinct: boolean;
  /**
   * Where the call's VALUE expression starts in the stored formula — `call.argStart`, past any
   * leading set quantifier. Paired with `call.argEnd` it is the text the sleeve's slot renders.
   */
  valueStart: number;
}

/**
 * The set quantifier a call's argument opens with, and where the value expression begins after it.
 * Read off the same token scan `buildFormulaOwnerPlan` uses, so a `DISTINCT` written inside a
 * comment or a string is not one. A bare leading word can only be the quantifier here: every field
 * reference in a formula is a `{{ref}}` tag, never a bare identifier.
 */
function readArgumentQuantifier(
  tokens: readonly SqlToken[],
  call: FormulaAggregateCall
): { distinct: boolean; valueStart: number } {
  const first = tokens.find(
    t => t.kind !== 'comment' && t.start >= call.argStart && t.end <= call.argEnd
  );
  const word = first?.kind === 'word' ? first.value.toUpperCase() : '';
  // `ALL` is the default and means nothing to the sleeve, but left in the slot it is the same
  // syntax error `DISTINCT` would be.
  if (word === 'DISTINCT' || word === 'ALL') {
    return { distinct: word === 'DISTINCT', valueStart: first!.end };
  }
  return { distinct: false, valueStart: call.argStart };
}

/**
 * The ONE joined call shape `planFormulaSleeves` leaves in the outer SELECT: a non-DISTINCT
 * `COUNT`, computed off the dedup CTE exactly where the report metric `COUNT(<joined column>)` is.
 *
 * Exported because the emitter's routing guard must accept THAT shape and nothing else. A looser
 * "joined reference inside some aggregate" also accepts a joined `SUM` whose sleeve went missing
 * between planning and emission, which renders the fan-out-inflated number the sleeve prevents.
 */
export function isJoinedCallLeftInPlace(
  tokens: readonly SqlToken[],
  call: FormulaAggregateCall
): boolean {
  return (
    call.owner.kind === 'joined' &&
    call.fn === 'COUNT' &&
    !readArgumentQuantifier(tokens, call).distinct
  );
}

/**
 * Keeps the call index — the ONLY thing telling two calls of one metric apart — on the safe side of
 * the byte cut, by shortening the name part instead of the whole identifier. Redshift TRUNCATES
 * rather than rejects, so without this two calls of a long-named metric come back as one name and
 * the disambiguator has to invent a suffix that says nothing about which call it is.
 */
function withCallIndex(base: string, callIndex: number): string {
  const suffix = `_${callIndex}`;
  return (
    truncateIdentifierToByteLimit(base, MAX_IDENTIFIER_BYTES - identifierByteLength(suffix)) +
    suffix
  );
}

/**
 * The CTE base name for a formula sleeve. Derived from the metric and the call index rather than
 * from a column, because this sleeve has no column — it aggregates a rendered expression. Still
 * goes through `disambiguateSleeveCteNames` with every other sleeve: they share one WITH clause,
 * and a joined column literally named `fx_<metric>_<i>` would otherwise want the same name.
 */
export function formulaSleeveCteName(metricOutputName: string, callIndex: number): string {
  return withCallIndex(`sleeve_fx_${sanitizeSleeveNamePart(metricOutputName)}`, callIndex);
}

/**
 * The sleeve's single output column. Only ever read qualified by the sleeve's own (disambiguated)
 * CTE name, so it need not be unique across sleeves — it is anyway, so that a caller which routed
 * a formula pull through the ordinary sleeve SELECT emits a wrong-but-named column instead of two
 * items sharing one alias. The `_fx_` prefix keeps it clear of the wrapper's `_owox_dim_<i>`.
 */
export function formulaSleevePullAlias(metricOutputName: string, callIndex: number): string {
  return withCallIndex(`_fx_${sanitizeSleeveNamePart(metricOutputName)}`, callIndex);
}

/**
 * Whether a call was written with MORE THAN ONE argument — a top-level comma inside its own
 * parentheses. Read off the same token scan `buildFormulaOwnerPlan` uses, so a comma inside a string
 * literal (`LISTAGG(x, '|')`), a comment, or a nested call (`SUM(GREATEST(a, b))`) is not one.
 *
 * Argument SEPARATION is ANSI and identical on every warehouse, so counting it here keeps this
 * module dialect-free — it recognises no function's signature, only that a second argument exists.
 */
function hasSeveralArguments(tokens: readonly SqlToken[], call: FormulaAggregateCall): boolean {
  let depth = 0;
  for (const token of tokens) {
    if (token.kind !== 'punct') continue;
    if (token.start < call.start || token.end > call.end) continue;
    if (token.value === '(') depth++;
    else if (token.value === ')') depth--;
    // Depth 1 is this call's own argument list; anything deeper belongs to a nested call.
    else if (token.value === ',' && depth === 1) return true;
  }
  return false;
}

/**
 * Which formula sleeves exist, in WITH-clause order: every joined aggregate call of every metric,
 * metrics in the order given and calls in formula order. An own-owner call renders in place in the
 * outer SELECT and gets no sleeve; a call `buildFormulaOwnerPlan` refused (mixed owners) comes back
 * as own-owner too, so it is skipped rather than given an invented grain.
 *
 * A JOINED call carrying SEVERAL arguments is refused: `FormulaSleeveGroup.valueSql` is singular, so
 * the extras are dropped — and `LISTAGG(x, '|')` becoming `LISTAGG(_val)` is ACCEPTED by Snowflake
 * and Redshift with an empty delimiter, returning a silently wrong string. Refused at emission
 * rather than at save so it covers every path, not the save endpoint alone.
 *
 * Only a path that is no legal alias path at all is refused here, where `aliasPathToCteName` would
 * throw a bare `Error` whose 500 carries no body.
 */
export function planFormulaSleeves(
  metrics: ReadonlyArray<{ outputName: string; formula: string; ownerPlan: FormulaOwnerPlan }>
): FormulaSleevePlan[] {
  const plans: FormulaSleevePlan[] = [];
  for (const { outputName, formula, ownerPlan } of metrics) {
    // Derived from the calls the loop below actually reads, not from `hasJoinedCall`: a guard must
    // not be skipped because a summary flag and the calls it summarises disagree.
    const needsArgumentScan = ownerPlan.calls.some(c => c.owner.kind === 'joined');
    const tokens = needsArgumentScan ? scanSql(formula) : [];
    ownerPlan.calls.forEach((call, callIndex) => {
      if (call.owner.kind !== 'joined') return;
      const { aliasPath } = call.owner;
      const ownerCteName = tryAliasPathToCteName(aliasPath);
      if (!ownerCteName) {
        throw new BusinessViolationException(
          `Calculated field '${outputName}' aggregates ${call.fn}(...) over the joined source ` +
            `'${aliasPath}', which is not a valid source path. Edit the formula to reference an ` +
            `existing joined Data Mart`,
          { calculatedField: outputName, aliasPath }
        );
      }
      if (hasSeveralArguments(tokens, call)) {
        throw new BusinessViolationException(
          `Calculated field '${outputName}': ${call.fn}(...) reads the joined source ` +
            `'${aliasPath}' and was given more than one argument. An aggregate over a joined ` +
            `Data Mart currently takes exactly one argument — remove the extra argument(s), or ` +
            `compute this part on the calculated field's own Data Mart`,
          { calculatedField: outputName, aliasPath, function: call.fn }
        );
      }
      const quantifier = readArgumentQuantifier(tokens, call);
      // Only COUNT's DISTINCT has somewhere to go: the sleeve's outer wrapper spells it through the
      // dialect's own `COUNT(DISTINCT …)`. Every other aggregate would have to carry the quantifier
      // into the deduped inner slot, where it is a syntax error the analyst would meet at report
      // time — so it is refused here, before any SQL is emitted, on every emission path.
      if (quantifier.distinct && call.fn !== 'COUNT') {
        throw new BusinessViolationException(
          `Calculated field '${outputName}': ${call.fn}(DISTINCT ...) reads the joined source ` +
            `'${aliasPath}'. Only COUNT(DISTINCT ...) can be de-duplicated over a joined Data ` +
            `Mart — drop the DISTINCT, or compute this part on the calculated field's own Data Mart`,
          { calculatedField: outputName, aliasPath, function: call.fn }
        );
      }
      // A joined COUNT counts ROWS, and the two candidate row sets are 5× apart on a fanning join:
      // a sleeve counts the owner's deduped RAW rows, while the report metric `COUNT(<joined
      // column>)` counts the MAIN rows that survived the join, off the dedup CTE. The product rule
      // is "computed at the last join, after dedup", which is what the report path does — so a
      // formula COUNT gets no sleeve and renders in place over the dedup CTE, matching
      // `SLEEVE_ROUTING`'s own `COUNT: null`. `COUNT(DISTINCT …)` is a different question and keeps
      // its sleeve. An analyst who wants to count the joined rows has `COUNT(DISTINCT <key>)` and
      // the joined source's Unique Count.
      if (isJoinedCallLeftInPlace(tokens, call)) return;
      plans.push({
        metricOutputName: outputName,
        callIndex,
        call,
        aliasPath,
        ownerCteName,
        baseCteName: formulaSleeveCteName(outputName, callIndex),
        pullAlias: formulaSleevePullAlias(outputName, callIndex),
        distinct: quantifier.distinct,
        valueStart: quantifier.valueStart,
      });
    });
  }
  return plans;
}

/**
 * Whether a blended field's OWN declared pre-join `aggregateFunction` — its roll-up to ITS parent
 * join key, not a report's post-join metric — is a raw passthrough (`ANY_VALUE`, a 1:1 join) or a
 * genuine per-group-key aggregate (the "funnel" shape, `COUNT(DISTINCT hitId)` per session).
 *
 * The distinction decides what the sleeve reads: an identity field's reads the RAW row keyed by the
 * `__owox_rid` surrogate, a non-identity field's reads the dedup CTE's already-aggregated column
 * keyed by the pre-join GROUP KEY.
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
 * Splits a value-sleeve group mixing an identity passthrough with a real pre-join aggregate, so
 * `buildValueSleeveGroupCte` only ever builds ONE shape per CTE. Merged, the non-identity value
 * would be read off the row set the identity metric dedups by raw row, silently multiplying it once
 * per raw row of the fan-out.
 *
 * A guard rather than a routing step: `groupValueSleeveMetrics` keys on the metric column, so every
 * group it produces is already uniform.
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

// the WHERE post-join filter columns (a HAVING rule is never applied inside a sleeve) whose
// owning DEDUP CTE the sleeve must join so `qualifyColumn` can resolve a blended filter column.
// The clause comes off the rule — a `function` test would pull in the column of an
// aggregate-level Calculated Field's filter, which carries none.
export function sleeveFilterColumns(filterOpts: SleeveFilterOptions): string[] {
  return filterOpts.filters.filter(isWhereFilterRule).map(r => r.column);
}

/**
 * Every column whose owning DEDUP CTE the sleeve subquery has to join: the post-join filter columns
 * AND the kept-groups restriction's dimensions, since a Totals sleeve has no dimensions of its own
 * to pull those CTEs in.
 *
 * A ROW-LEVEL calculated field matches no dedup CTE and adds no join — correct, not a miss: its
 * formula reads only its own Data Mart, where the sleeve's FROM already starts.
 */
export function sleeveJoinColumns(filterOpts: SleeveFilterOptions): string[] {
  return [...sleeveFilterColumns(filterOpts), ...(filterOpts.keptGroups?.dimensions ?? [])];
}

/**
 * Deterministically disambiguates intended sleeve CTE base names so no two collide in one WITH
 * clause: the first occurrence keeps the name, later duplicates get the smallest `_<n>` suffix.
 *
 * Not left to field-type governance, which uses a blended field's `postJoinAggregations` override
 * VERBATIM without the clamp the Totals path applies — so a stale override can request SUM(X) and
 * COUNT_DISTINCT(X) on one joined column, and the two sleeves both want the bare `sleeve_<X>` name.
 *
 * `used` must ALSO be seeded with every REAL CTE name already in the WITH clause, or a sleeve name
 * coinciding with a chain's own `cteName` keeps it — the sleeve then fails as a duplicate WITH
 * entry, or, where the dialect tolerates redefinition, reads the wrong CTE instead of failing loud.
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
 * Groups COUNT_DISTINCT sleeve metrics by their OWNER CHAIN.
 *
 * Metrics sharing an owner resolve to the same joins, WHERE and GROUP BY — only the counted column
 * differs — so one CTE serves all of them with one aggregate each. Without it a Totals report over
 * five joined text columns emitted five CTEs, each re-scanning the same sources.
 *
 * The owner chain is the WHOLE key here: dimensions are report-wide for this shape and the counted
 * column is an argument, not a deduped tuple slot — unlike a value-sleeve group, whose key also
 * carries its column and its dimensions. Insertion order is preserved so the emitted WITH clause
 * stays deterministic.
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
