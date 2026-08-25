import type { DataMartSchemaField } from '../data-storage-types/data-mart-schema.type';
import type { CalculatedMetricPlan } from '../data-storage-types/utils/sql-clause-renderer';
import { liveFormulaReferences } from './formula-live-reference';
import type { FormulaReference } from './formula-reference';
import { isAggregateLevel, type CalculatedFieldLevel } from './formula-level';
import { isUniversalAggregateFunction } from './formula-function-dialect';
import { findFunctionCalls } from './sql-function-calls';
import { scanSql } from './sql-token-scanner';
import { collectFormulaReferenceableFields } from '../data-storage-types/data-mart-schema.utils';
import { UNIQUE_COUNT_FIELD_TOKEN } from '../dto/schemas/unique-count-sources';
import {
  buildBlendedFieldUnifiedName,
  collectAmbiguousBlendedFieldNames,
} from '../services/blended-field-name';

export type CalculatedFieldConfig = NonNullable<DataMartSchemaField['calculated']>;

/**
 * A calculated field has no column behind it in the warehouse. Every schema traversal has to
 * decide what to do with that fact, so the predicate lives in one place — see spec §2.1.
 */
export function isCalculatedField(
  field: Pick<DataMartSchemaField, 'calculated'>
): field is DataMartSchemaField & { calculated: CalculatedFieldConfig } {
  return field.calculated !== undefined;
}

/**
 * A calculated field whose RECORDED level aggregates — the only kind that existed before #6732's
 * row-level slice.
 *
 * Deliberately NOT a rename of `isCalculatedField`, which answers a different question ("has a
 * formula, therefore no warehouse column behind it") that report headers, data quality and AI
 * sampling are all correct to keep asking. Whether an absent `level` aggregates is answered once,
 * by `isAggregateLevel`.
 *
 * It has NO production caller since a formula may reference another one: the seat that decides a
 * GROUP BY (`calculatedFieldLevelOf`) asks the formula TEXT first and the recorded level only after,
 * because the recorded level is a cache (D13). Kept as the canonical spelling of that narrower
 * question, which `data-mart-details.tool.ts` mirrors for a published `RawField` it cannot walk.
 */
export function isAggregateCalculatedField(
  field: Pick<DataMartSchemaField, 'calculated'>
): boolean {
  return isCalculatedField(field) && isAggregateLevel(field.calculated.level);
}

/** A calculated field whose formula is row-level: a dimension, not a metric (spec §2). */
export function isRowLevelCalculatedField(field: Pick<DataMartSchemaField, 'calculated'>): boolean {
  return isCalculatedField(field) && !isAggregateLevel(field.calculated.level);
}

/** A schema field known to carry a formula. Later tasks name this type in their signatures. */
export type CalculatedSchemaField = DataMartSchemaField & { calculated: CalculatedFieldConfig };

export function calculatedFieldsOf(
  fields: readonly DataMartSchemaField[]
): CalculatedSchemaField[] {
  return fields.filter(isCalculatedField);
}

/**
 * The schema's calculated fields by name — the ONLY formula targets that exist (#6732).
 *
 * `collectFormulaReferenceableFields` recurses into RECORD/STRUCT children, so it can yield a
 * dotted `parent.child` that carries a formula; this deliberately cannot. Nothing could substitute
 * such a field — every plan factory reads `calculatedFieldsOf`, which does not recurse — and
 * `DataMartSchemaParserFacade` refuses that schema shape on every save path. So a NESTED calculated
 * field is not a dependency: `brokenReferencesOf` reports a reference to one rather than letting it
 * resolve to a level, or to a bare column that does not exist.
 */
function substitutableFieldsByName(
  fields: readonly DataMartSchemaField[]
): ReadonlyMap<string, CalculatedSchemaField> {
  return new Map(calculatedFieldsOf(fields).map(field => [field.name, field]));
}

/**
 * A formula's OWN-Data-Mart live references — none when it cannot be parsed, the same degradation
 * every other reader of a stored formula makes. A joined one is excluded because a joined Data
 * Mart's calculated field stays refused (D12) and is never substituted.
 */
function ownLiveReferences(formula: string): FormulaReference[] {
  try {
    return liveFormulaReferences(formula).filter(ref => !ref.path);
  } catch {
    return [];
  }
}

/**
 * Whether a formula reads a JOINED Data Mart at all (#6732, D22).
 *
 * The question D22 actually asks is "would this formula's aggregate be lifted into a metric
 * sleeve?", and `FormulaOwnerAnalysis.plan.hasJoinedCall` is the seat that answers it — but only
 * with a DIALECT in hand, which the composition-time validator does not resolve. A live joined
 * REFERENCE is the dialect-free superset of that answer: a call can only be joined-owned because a
 * joined reference sits inside it, so nothing `hasJoinedCall` catches is missed here, while a
 * formula whose only aggregate is a dialect-specific spelling (`LISTAGG`, `APPROX_COUNT_DISTINCT`)
 * is still caught. Refusing a shade more than the sleeve strictly requires — a plain joined `COUNT`
 * is left in the outer SELECT and gets no sleeve — is the safe direction for a rule whose other
 * side is a filter reading a value the SELECT does not print.
 *
 * An unparseable formula reads as "no joined reference", the same degradation every other reader
 * of a stored formula makes: it is refused by `brokenReferencesOf` on its own terms instead.
 */
export function readsJoinedDataMart(field: Pick<DataMartSchemaField, 'calculated'>): boolean {
  if (!isCalculatedField(field)) return false;
  try {
    return liveFormulaReferences(field.calculated.formula).some(ref => ref.path !== '');
  } catch {
    return false;
  }
}

/**
 * The level to put on a field's `CalculatedMetricPlan` — the ONE seat that decides whether a
 * calculated field is a GROUP BY key (design §2).
 *
 * Both plan build sites (the flat composer and the blended decision) call this rather than reading
 * `calculated.level` themselves, so the "absent reads as an aggregate" fallback cannot be spelled
 * one way on one path and another way on the other — the two paths differ by a GROUP BY, and a plan
 * is the last place that shows.
 *
 * It re-derives rather than trusting the persisted level, because that level is a CACHE (D13):
 * `ActualizeDataMartSchemaService` writes `dataMart.schema` without running the validator that
 * maintains it, so nothing propagates a change of B's level to the A that reads B. The rule is
 * spec §2.1's, transitively: aggregate-level if the field's own formula aggregates, or ANY field in
 * its dependency chain is aggregate-level. `revenue / cost` over two aggregating formulas holds no
 * aggregate call in its own text at all, so the non-transitive reading calls it a row-level
 * dimension and the report silently collapses to a grand total — no error, no log line.
 *
 * "Aggregates" is asked of the formula TEXT first and of the recorded level only after, and the
 * order matters: the text is the fact, the level is the cache. It is asked without a dialect — none
 * of the three services that reach this seat resolves one — so the text half recognises exactly the
 * functions EVERY storage agrees are aggregates (`isUniversalAggregateFunction`). That is a strict
 * lower bound on what the per-dialect derivation would say, never a guess: a name in that set is an
 * aggregate on all five, so the two answers cannot contradict each other.
 *
 * The RESIDUAL, stated rather than implied: a formula whose only aggregate is a dialect-specific
 * spelling (`LISTAGG`, `APPROX_COUNT_DISTINCT`, …) is still answered from the recorded level. A
 * union of all five dialects' names would close that and open a worse hole — Redshift's set
 * deliberately lacks `CORR`, so a union would upgrade a legal Redshift row-level formula into an
 * ungrouped expression the warehouse rejects.
 *
 * Only ever UPGRADES to 'metric'. Wrong in that direction is a warehouse error (an ungrouped
 * expression); wrong in the other is a plausible number.
 */
export function calculatedFieldLevelOf(
  field: Pick<DataMartSchemaField, 'calculated'>,
  schemaFields: readonly DataMartSchemaField[]
): CalculatedFieldLevel {
  if (!isCalculatedField(field)) return 'metric';

  const substitutable = substitutableFieldsByName(schemaFields);
  // A schema written by a path that skips save-time validation can hold a loop; answering it is the
  // renderer's job (it refuses by name), surviving it is this one's.
  const visited = new Set<string>();
  const aggregatesAnywhere = (config: CalculatedFieldConfig): boolean => {
    if (formulaAggregatesUniversally(config.formula)) return true;
    if (isAggregateLevel(config.level)) return true;
    for (const ref of ownLiveReferences(config.formula)) {
      const dependency = substitutable.get(ref.field);
      if (!dependency || visited.has(ref.field)) continue;
      visited.add(ref.field);
      if (aggregatesAnywhere(dependency.calculated)) return true;
    }
    return false;
  };
  return aggregatesAnywhere(field.calculated) ? 'metric' : 'column';
}

/**
 * Whether a formula's own text calls a function every supported storage agrees is an aggregate.
 *
 * `findFunctionCalls` reads the scanned tokens with COMMENTS already dropped, and a call inside a
 * string literal is one string token rather than a name followed by `(` — so this is the same
 * live-only reading of a stored formula as everywhere else in this feature, for free.
 */
function formulaAggregatesUniversally(formula: string): boolean {
  return findFunctionCalls(scanSql(formula)).some(call => isUniversalAggregateFunction(call.name));
}

/**
 * The plans a formula needs SUBSTITUTED into it: the transitive closure of the calculated fields it
 * reads, flat and de-duplicated (#6732, D15).
 *
 * A dependency is NOT a column. It is deliberately carried inside the plan that needs it rather
 * than beside it in the report's `calculatedMetrics` array, because that array is what every
 * downstream surface derives a projection and a HEADER from — a report selecting `roas` would gain
 * `revenue` and `cost` as columns nobody asked for, in the Google Sheet, in Looker Studio and in
 * MCP alike — and what the Totals restriction reads its GROUP BY keys off. Carried here, a
 * dependency cannot become either by omitting a filter somewhere.
 *
 * FLAT, not nested: a cyclic schema would otherwise build a cyclic object graph out of plans that
 * travel through DTOs and a cache. Every level of the expansion looks names up in the same closure.
 * The field that CLOSES a loop is kept in it for exactly that reason — dropped, its reference would
 * fall through to the plain column resolver and render `main."a"`, a wrong column, silently.
 *
 * No `alias`/`description`: those are a metric's only header source, and a dependency has no header.
 *
 * `undefined` — never an empty array — when a formula reads only columns, so a plan for one of
 * those stays byte-identical to what it was before this feature.
 */
export function calculatedDependencyPlans(
  field: CalculatedSchemaField,
  schemaFields: readonly DataMartSchemaField[]
): CalculatedMetricPlan[] | undefined {
  const substitutable = substitutableFieldsByName(schemaFields);
  const plans: CalculatedMetricPlan[] = [];
  const planned = new Set<string>();
  const collect = (formula: string): void => {
    for (const ref of ownLiveReferences(formula)) {
      const dependency = substitutable.get(ref.field);
      if (!dependency || planned.has(ref.field)) continue;
      planned.add(ref.field);
      plans.push({
        outputName: dependency.name,
        type: String(dependency.type),
        formula: dependency.calculated.formula,
        level: calculatedFieldLevelOf(dependency, schemaFields),
      });
      collect(dependency.calculated.formula);
    }
  };
  collect(field.calculated.formula);
  return plans.length > 0 ? plans : undefined;
}

/**
 * `columnFilter` with each selected calculated-metric name removed. A calculated metric renders
 * through its own dedicated channel — the query builder's `calculatedMetrics` option, and the
 * reader's synthesized header — so leaving its name in a plain projection list too would
 * double-handle it: once correctly through that channel, once as a stray reference the plain
 * projection / header fallback does not know is already spoken for. Shared by the composer (for
 * the query builder's `columns`) and every real-execution-path caller of `prepareReportData`
 * (for `PrepareReportDataOptions.columnFilter`) so the exclusion cannot drift between the two.
 */
export function excludeCalculatedMetricNames(
  columnFilter: readonly string[] | undefined,
  calculatedMetricNames: ReadonlySet<string>
): string[] | undefined {
  if (calculatedMetricNames.size === 0) return columnFilter as string[] | undefined;
  return columnFilter?.filter(name => !calculatedMetricNames.has(name));
}

/**
 * The `columnFilter` to hand a reader alongside a composed plan's `calculatedMetrics`.
 *
 * Every real read path (report run, Looker cache, HTTP Data stream, MCP query, Totals) needs
 * exactly this pairing and had its own copy of it — five identical `new Set(x?.map(...) ?? [])`
 * expressions, each under the same four-line comment warning about the drift a copy invites. The
 * two arguments come from the SAME composed result, so binding them in one function is what
 * actually removes the risk: a caller can no longer forward the metrics while forgetting to strip
 * their names, which double-handles the metric — once correctly through its own channel, once as
 * a stray plain-projection reference the header resolver does not know is already spoken for.
 */
export function columnFilterWithoutCalculatedMetrics(
  columnFilter: readonly string[] | undefined,
  calculatedMetrics: readonly CalculatedMetricPlan[] | undefined
): string[] | undefined {
  return excludeCalculatedMetricNames(
    columnFilter,
    new Set((calculatedMetrics ?? []).map(metric => metric.outputName))
  );
}

/**
 * A calculated metric is a top-level output of the Data Mart (`calculatedFieldsOf` only ever
 * looks at the top level). A field with `calculated` set inside a BigQuery/Snowflake RECORD or
 * STRUCT is a shape no consumer resolves — if its container is later dropped by the warehouse,
 * both `collectSchemaFieldPathDescriptors` and `flattenSchemaFields` prune it along with the dead
 * container, so it must be rejected at save time rather than silently disappear later.
 */
export function collectNestedCalculatedFieldNames(
  fields: readonly DataMartSchemaField[]
): string[] {
  const names: string[] = [];
  const walk = (nodes: readonly DataMartSchemaField[], depth: number) => {
    for (const field of nodes) {
      if (depth > 0 && isCalculatedField(field)) names.push(field.name);
      if ('fields' in field && field.fields?.length) {
        walk(field.fields as DataMartSchemaField[], depth + 1);
      }
    }
  };
  walk(fields, 0);
  return names;
}

/**
 * Characters a calculated field's name may not hold, because nothing downstream can render one.
 * The name is emitted as an output identifier — `AS <escaped name>` — through the storage's
 * escaper, and is how another formula addresses it in a `{{ref field="…"}}` tag:
 *
 * - `.` — every escaper splits on it into qualifiers (`createIdentifierEscaper` for BigQuery,
 *   Databricks, Athena and Redshift; `escapeSnowflakeIdentifier` for Snowflake), so `a.b` renders
 *   as two quoted parts, which is not an alias any of the five accepts;
 * - a backtick — BigQuery's and Databricks' own quote character, and the shared escaper doubles it
 *   rather than backslash-escaping it, which BigQuery reads as two adjacent identifiers;
 * - `"` — Athena's, Redshift's and Snowflake's quote character, and what a reference tag quotes a
 *   value with (`serializeFormulaReference` refuses one for that reason);
 * - `\` — BigQuery reads it as an escape sequence inside a quoted identifier, so `a\b` would name
 *   a different column than the one written down, with nothing on screen to say so;
 * - a control character, a line break included, which no dialect's quoting carries intact.
 *
 * A PHYSICAL column is deliberately not held to this: its name comes from the warehouse rather
 * than from a person (Redshift and Snowflake both permit a dot inside a quoted identifier), so
 * refusing one would block the save of a schema OWOX did not author.
 */
const UNRENDERABLE_NAME_CHARACTERS = /[.`"\\]/;

function isUnrenderableName(name: string): boolean {
  if (UNRENDERABLE_NAME_CHARACTERS.test(name)) return true;
  // Control characters by code point rather than by a regex class, which `no-control-regex` bans.
  return [...name].some(character => {
    const code = character.codePointAt(0) ?? 0;
    return code < 0x20 || code === 0x7f;
  });
}

/** Top-level calculated fields whose name holds a character the generated SQL cannot carry. */
export function collectUnrenderableCalculatedFieldNames(
  fields: readonly DataMartSchemaField[]
): string[] {
  return calculatedFieldsOf(fields)
    .filter(field => isUnrenderableName(field.name))
    .map(field => field.name);
}

/**
 * Top-level calculated fields sharing a name with another top-level field.
 *
 * Every consumer keys a field by name through a last-wins `Map` — the composer's `byName`, this
 * module's `substitutableFieldsByName`, the validator's `derivedLevels`, a report's `columnConfig`
 * — so under a duplicate the winner is decided by schema ORDER, which the analyst controls. The
 * visible half is the type: a calculated field declared FLOAT behind a STRING column of the same
 * name is coerced as a STRING before an aggregation reads it, i.e. a `CAST` to a type nobody
 * declared. Two PHYSICAL columns colliding is left alone — that is the warehouse's business and
 * predates this feature.
 *
 * Compared CASE-INSENSITIVELY, which a byte-exact check missed: `Revenue` and `revenue` both
 * survived it, and then the warehouses disagreed about what that means. Redshift folds delimited
 * identifiers by default and Athena and Databricks resolve identifiers case-insensitively, so the
 * result set carries two columns of one name and every reader keeps one of them — a silently wrong
 * number. BigQuery refuses the query instead: the same defect, surfacing loudly on one dialect and
 * quietly on three.
 *
 * Snowflake is the one storage where the pair is genuinely distinct, because we quote every
 * identifier and a quoted one keeps its case there. Refusing it anyway is deliberate: the check has
 * no dialect to consult, and the trade is a naming restriction almost nobody wants against a wrong
 * number nobody can see. Loud everywhere beats correct on one storage and silent on three.
 */
export function collectCollidingCalculatedFieldNames(
  fields: readonly DataMartSchemaField[]
): string[] {
  const occurrences = new Map<string, number>();
  for (const field of fields) {
    const key = field.name.toUpperCase();
    occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
  }
  const colliding: string[] = [];
  for (const field of calculatedFieldsOf(fields)) {
    if ((occurrences.get(field.name.toUpperCase()) ?? 0) > 1 && !colliding.includes(field.name)) {
      colliding.push(field.name);
    }
  }
  return colliding;
}

/**
 * References of a calculated field that no longer resolve against `schemaFields`. Empty means
 * usable; anything else is the broken state of spec §7, and these names go verbatim into the
 * error the query fails with.
 *
 * A reference to another CALCULATED field is not broken for being one — that refusal is what #6732
 * lifts. What replaced it is TRANSITIVE: A is only as usable as its whole chain, so B's own
 * dependencies are walked too and what comes back is the column that actually went missing, or the
 * name of a dependency whose formula cannot be parsed at all. Consumers must therefore NOT phrase
 * this list as "gone from the Data Mart": a dependency reported by name is right there in the
 * schema, it just cannot be computed. A NESTED calculated target is reported (it is not a formula
 * target — see `substitutableFieldsByName`), and a loop is walked once rather than for ever.
 *
 * Resolves the same way `CalculatedFieldValidatorService` does at save time —
 * `collectFormulaReferenceableFields`, NOT `collectSchemaFieldPathDescriptors`: a field taken off
 * the reporting menu (`isHiddenForReporting`) is still readable by a formula (spec §7), so it must
 * not come back here as "broken" just because it is invisible to the picker. CALLERS must pass the
 * Data Mart's OWN schema fields for that to hold — a pre-filtered list (e.g. the blendable
 * schema's `nativeFields`) reports every metric over a hidden column as broken.
 *
 * A bare reference to `unique_count` is likewise cleared unless a REAL field owns that name. Save
 * time now REJECTS that reference outright (`mainUniqueCountReference`), so no new formula can
 * carry one — this clause only shields formulas persisted before that check existed, which would
 * otherwise be reported as referencing a column "gone from the Data Mart" that never existed.
 *
 * Composition time is not redundant with the save-time validator that this mirrors:
 * `ActualizeDataMartSchemaService` writes `dataMart.schema` after every warehouse actualization
 * WITHOUT running `CalculatedFieldValidatorService` — that validator is wired only into
 * `update-data-mart-schema.service.ts`, the analyst-facing save path — and the schema mergers
 * (`bigquery-schema-merger.ts` and its siblings) deliberately carry a calculated field through
 * untouched on every merge. So a formula can silently outlive a column it depends on: the field
 * disappears from the warehouse, actualization drops it from the schema, and the formula is none
 * the wiser. This function is what a composing surface (report, MCP, HTTP Data ad-hoc) checks
 * instead, on every read — the last chokepoint before the query fails at the warehouse.
 *
 * Joined references (`ref.path` set) are skipped: they resolve against the Data Mart's JOIN TREE,
 * not against `schemaFields`, so this function — which only ever sees one Data Mart's own fields —
 * would report every one of them as missing. Save time resolves them against the blendable schema
 * (`FORMULA_JOINED_PATH_NOT_FOUND` / `FORMULA_JOINED_FIELD_NOT_AVAILABLE`), and a persisted joined
 * reference going stale afterwards is reported by `brokenJoinedReferencesOf` below — every caller
 * of this function that HAS a join tree at hand must combine the two.
 *
 * An UNPARSEABLE stored formula is reported as broken (the field's own name), never rethrown.
 * `parseFormulaReferences` throws `FormulaReferenceSyntaxError` on malformed Handlebars, and this
 * now runs on every `computeBlendableSchema` — i.e. on the blendable-schema endpoint the report
 * editor opens with. Letting it escape would turn one bad persisted formula (a hand-written API
 * call, or a row written before the save-time validator existed) into a 500 for the whole schema,
 * with no way to reach the editor that could fix it. Broken is exactly what such a formula IS.
 *
 * Only LIVE references count, exactly as in `brokenJoinedReferencesOf` below: a reference inside a
 * SQL comment is not SQL, so it must not be why a metric reads as broken. The two halves share ONE
 * `missing` array on one hard-blocking channel (blendable-schema.service.ts), so a rule applied to
 * one of them alone is a rule the analyst sees applied at random.
 */
export function brokenReferencesOf(
  field: CalculatedSchemaField,
  schemaFields: readonly DataMartSchemaField[]
): string[] {
  const known = new Map(
    collectFormulaReferenceableFields(schemaFields).map(d => [d.name, d.field])
  );
  const substitutable = substitutableFieldsByName(schemaFields);
  const broken = new Set<string>();
  const walked = new Set<string>();

  const walk = (current: CalculatedSchemaField): void => {
    let references: FormulaReference[];
    try {
      references = liveFormulaReferences(current.calculated.formula);
    } catch {
      broken.add(current.name);
      return;
    }
    for (const ref of references) {
      if (ref.path) continue;
      const found = known.get(ref.field);
      if (!found) {
        if (ref.field !== UNIQUE_COUNT_FIELD_TOKEN) broken.add(ref.field);
        continue;
      }
      if (!isCalculatedField(found)) continue;
      const dependency = substitutable.get(ref.field);
      if (!dependency) {
        broken.add(ref.field);
        continue;
      }
      if (walked.has(ref.field)) continue;
      walked.add(ref.field);
      walk(dependency);
    }
  };

  walk(field);
  return [...broken];
}

/**
 * Why a joined field cannot be read by a formula, or `'ok'` when it can. Every value but `'ok'` is
 * a refusal a caller must NAME — an unreadable field reported as merely unknown sends the analyst
 * looking for something that is right there.
 *
 * - `hidden` — taken off the reporting menu in its own Data Mart.
 * - `calculated` — a formula of the JOINED Data Mart, with no warehouse column behind it. Refused,
 *   and the refusal is NOT symmetric with the metric's own Data Mart: since #6732 a formula may
 *   read another formula of its OWN mart, which is substituted at compose time. It may not read a
 *   joined one (D12), for reasons that are structural rather than unbuilt — `BlendedFieldDto`
 *   publishes only `isCalculated`, so neither the formula nor its level crosses that wire; and
 *   routing plus `assertAllRequestedSourcesAccessible` are both decided from the READING formula's
 *   own text, so a source reachable only through the joined formula would be joined without ever
 *   being access-checked. Substituting it is therefore refused permanently, not deferred.
 * - `ambiguous` — it and another visible field of this join tree fold to one unified blended name,
 *   which `buildBlendedFieldIndex` refuses to resolve at report time.
 */
export type JoinedFieldState = 'ok' | 'hidden' | 'calculated' | 'ambiguous';

/** One joined source of the tree: whether this user may read it, and the state of each of its fields. */
export interface JoinedReferenceSource {
  /**
   * `AvailableSourceDto.isAccessibleForReporting` for the user this schema was computed for. A
   * formula reading a source the user cannot read is refused HERE — the composer refuses it too,
   * but as a whole-request envelope naming no field, which the metric dialog can only show as a
   * generic toast.
   */
  isAccessible: boolean;
  /** The source's ORIGINAL field names → what a formula may do with each. */
  fields: ReadonlyMap<string, JoinedFieldState>;
}

/**
 * What a joined `path`/`field` pair resolves against. Keyed by the structural identity a `{{ref}}`
 * tag carries, never by the unified `<path>__<field>` name a column picker speaks, and it
 * deliberately KEEPS unusable fields so they can be refused with a reason rather than read as
 * unknown.
 */
export type JoinedReferenceIndex = ReadonlyMap<string, JoinedReferenceSource>;

/**
 * Builds that index from a blendable schema. ONE definition, because save time refuses exactly what
 * composition time must call broken: two derivations that drift let a formula save and then fail to
 * compose (or the reverse — a working metric greyed out in the picker).
 *
 * Every source the tree exposes is indexed, INCLUDED OR NOT. `buildRelationshipChains` builds an
 * excluded source's join unconditionally (see blended-report-data.service.ts, whose own comment
 * calls that load-bearing), so its fields stay readable; treating exclusion as breakage only inside
 * a formula would be an asymmetry no analyst could explain. INACCESSIBLE is the opposite case and is
 * carried per source rather than dropped: the query genuinely cannot be built for this user, and
 * saying so beats reporting the path as if the join did not exist.
 *
 * A field whose source the walk did not report is dropped rather than given a source entry of its
 * own — it is unreachable by definition.
 */
export function buildJoinedReferenceIndex(schema: {
  availableSources: readonly { aliasPath: string; isAccessibleForReporting?: boolean }[];
  blendedFields: readonly {
    aliasPath: string;
    originalFieldName: string;
    isHidden: boolean;
    isCalculated?: boolean;
  }[];
}): JoinedReferenceIndex {
  const ambiguousNames = collectAmbiguousBlendedFieldNames(schema.blendedFields);
  const index = new Map<string, { isAccessible: boolean; fields: Map<string, JoinedFieldState> }>(
    schema.availableSources.map(source => [
      source.aliasPath,
      { isAccessible: source.isAccessibleForReporting !== false, fields: new Map() },
    ])
  );
  for (const field of schema.blendedFields) {
    index
      .get(field.aliasPath)
      ?.fields.set(field.originalFieldName, joinedFieldState(field, ambiguousNames));
  }
  return index;
}

function joinedFieldState(
  field: {
    aliasPath: string;
    originalFieldName: string;
    isHidden: boolean;
    isCalculated?: boolean;
  },
  ambiguousNames: ReadonlySet<string>
): JoinedFieldState {
  // Calculated first: it is the most specific thing true about the field, and it is the one a
  // hidden calculated metric would otherwise be reported as merely hidden.
  if (field.isCalculated) return 'calculated';
  if (field.isHidden) return 'hidden';
  return ambiguousNames.has(buildBlendedFieldUnifiedName(field.aliasPath, field.originalFieldName))
    ? 'ambiguous'
    : 'ok';
}

/**
 * Joined references of a calculated field that no longer resolve against the Data Mart's JOIN TREE
 * — the half `brokenReferencesOf` deliberately skips, because it only ever sees one Data Mart's own
 * fields. Reported as `path.field`, the same label save-time validation names.
 *
 * Broken means the join is gone or renamed out from under the formula (the alias names no source),
 * the source is no longer readable by this user, or the field is gone / hidden / calculated /
 * ambiguous — i.e. exactly the states `CalculatedFieldValidatorService` refuses at save time. A
 * joined `unique_count` is broken too: the measure exists but no slice can render it, and save time
 * refuses it, so a formula carrying one was persisted before that check existed.
 *
 * Only LIVE references count: a reference inside a SQL comment is not SQL, so a commented-out one
 * must not be the reason a metric reads as broken (the bug class the owner plan closed).
 * An unparseable formula returns nothing here — `brokenReferencesOf` already reports the field
 * itself, and saying it twice would name the metric as its own missing reference.
 */
export function brokenJoinedReferencesOf(
  field: CalculatedSchemaField,
  index: JoinedReferenceIndex
): string[] {
  let references;
  try {
    references = liveFormulaReferences(field.calculated.formula);
  } catch {
    return [];
  }

  const broken: string[] = [];
  for (const ref of references) {
    if (ref.path === '') continue;
    const source = index.get(ref.path);
    if (source?.isAccessible && source.fields.get(ref.field) === 'ok') continue;
    const label = `${ref.path}.${ref.field}`;
    if (!broken.includes(label)) broken.push(label);
  }
  return broken;
}

/** One named refusal: the offending column, and the sentence both seats report it with. */
export interface JoinedCalculatedFieldRefusal {
  column: string;
  message: string;
}

/**
 * The joined Data Mart calculated fields a report REFERENCES — one refusal per distinct field, in
 * first-reference order — on ANY surface: projection, filter, sort, aggregation or date bucket.
 *
 * The report-surface half of the boundary `brokenJoinedReferencesOf` enforces inside a formula
 * (D12), and refused for the same reason: `BlendedFieldDto` publishes `isCalculated` and nothing
 * else, so the joined mart's formula never crosses that wire and there is nothing here to render.
 * What the blended path does instead is project the field's `originalFieldName` from the joined
 * mart's PHYSICAL table (blend-cte.builder) — usually an unrecognised name, and a silently wrong
 * number wherever that table still carries a column of that name.
 *
 * ONE definition, called from both the validator and the composer: the validator refuses what a
 * report whose output controls already cost a blendable schema names, and the composer refuses the
 * projection unconditionally. Two derivations would be two rules, and this feature has drifted that
 * way before.
 *
 * `ownColumnNames` are the MAIN Data Mart's own field paths. A native column may legitimately own
 * the name a unified blended name folds to, and there the report reads the native column — so
 * refusing it would take a column the report is entitled to.
 */
export function joinedCalculatedFieldRefusals(
  blendedFields: readonly {
    name: string;
    isCalculated?: boolean;
    sourceDataMartTitle?: string;
  }[],
  referencedColumns: Iterable<string>,
  ownColumnNames: ReadonlySet<string>
): JoinedCalculatedFieldRefusal[] {
  const calculated = new Map(
    blendedFields.filter(field => field.isCalculated === true).map(field => [field.name, field])
  );
  if (calculated.size === 0) return [];

  const refusals: JoinedCalculatedFieldRefusal[] = [];
  const seen = new Set<string>();
  for (const column of referencedColumns) {
    if (seen.has(column) || ownColumnNames.has(column)) continue;
    const field = calculated.get(column);
    if (!field) continue;
    seen.add(column);
    const owner = field.sourceDataMartTitle
      ? `the joined Data Mart "${field.sourceDataMartTitle}"`
      : 'a joined Data Mart';
    refusals.push({
      column,
      message:
        `\`${column}\` is a calculated field of ${owner}: its formula belongs to that Data Mart ` +
        'and is not available here, so this report can only read that Data Mart’s real columns. ' +
        'Remove it from the report, or add the same calculation to this Data Mart.',
    });
  }
  return refusals;
}
