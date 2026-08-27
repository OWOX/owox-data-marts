import type { DataMartSchemaField } from '../data-storage-types/data-mart-schema.type';
import type { CalculatedFieldPlan } from '../data-storage-types/utils/sql-clause-renderer';
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
 * decide what to do with that fact, so the predicate lives in one place.
 */
export function isCalculatedField(
  field: Pick<DataMartSchemaField, 'calculated'>
): field is DataMartSchemaField & { calculated: CalculatedFieldConfig } {
  return field.calculated !== undefined;
}

/**
 * A calculated field whose RECORDED level aggregates. Not the same question as
 * `isCalculatedField`, which asks only whether a formula backs the field.
 */
export function isAggregateCalculatedField(
  field: Pick<DataMartSchemaField, 'calculated'>
): boolean {
  return isCalculatedField(field) && isAggregateLevel(field.calculated.level);
}

/** A calculated field whose formula is row-level: a dimension, not a metric. */
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
 * The schema's calculated fields by name — the ONLY formula targets that exist.
 *
 * Top level only, unlike `collectFormulaReferenceableFields`: nothing could substitute a nested
 * one, since every plan factory reads `calculatedFieldsOf`, which does not recurse. A reference to
 * one is reported by `brokenReferencesOf` rather than resolving to a column that does not exist.
 */
function substitutableFieldsByName(
  fields: readonly DataMartSchemaField[]
): ReadonlyMap<string, CalculatedSchemaField> {
  return new Map(calculatedFieldsOf(fields).map(field => [field.name, field]));
}

/**
 * A formula's OWN-Data-Mart live references — none when it cannot be parsed, the same degradation
 * every other reader of a stored formula makes. A joined one is excluded because a joined Data
 * Mart's calculated field stays refused and is never substituted.
 */
function ownLiveReferences(formula: string): FormulaReference[] {
  try {
    return liveFormulaReferences(formula).filter(ref => !ref.path);
  } catch {
    return [];
  }
}

/**
 * Whether a formula reads a JOINED Data Mart at all.
 *
 * What the caller wants to know is whether the aggregate would be lifted into a metric sleeve, and
 * `FormulaOwnerAnalysis.plan.hasJoinedCall` answers that — but only with a DIALECT in hand, which
 * the composition-time validator does not resolve. A live joined REFERENCE is the dialect-free
 * superset: a call can only be joined-owned because a joined reference sits inside it. Refusing a
 * shade more than the sleeve requires is the safe direction here.
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
 * The level to put on a field's `CalculatedFieldPlan` — the ONE seat that decides whether a
 * calculated field is a GROUP BY key.
 *
 * Re-derives rather than trusting the persisted level, which is a CACHE:
 * `ActualizeDataMartSchemaService` writes `dataMart.schema` without running the validator that
 * maintains it.
 *
 * Transitive — aggregate-level if the formula aggregates OR anything in its dependency chain does.
 * `revenue / cost` over two aggregating formulas holds no aggregate call of its own, so a
 * non-transitive reading calls it a dimension and the report collapses to a grand total.
 *
 * The text half runs without a dialect, so it recognises only the functions every storage agrees
 * are aggregates; a dialect-specific spelling falls back to the recorded level. Only ever UPGRADES
 * to 'metric': wrong that way is a warehouse error, wrong the other way is a plausible number.
 */
export function calculatedFieldLevelOf(
  field: Pick<DataMartSchemaField, 'calculated'>,
  schemaFields: readonly DataMartSchemaField[]
): CalculatedFieldLevel {
  if (!isCalculatedField(field)) return 'metric';

  const substitutable = substitutableFieldsByName(schemaFields);
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
 * Live text only: `findFunctionCalls` reads scanned tokens, so a call in a comment or a string
 * literal is not one.
 */
function formulaAggregatesUniversally(formula: string): boolean {
  return findFunctionCalls(scanSql(formula)).some(call => isUniversalAggregateFunction(call.name));
}

/**
 * The plans a formula needs SUBSTITUTED into it: the transitive closure of the calculated fields it
 * reads, flat and de-duplicated.
 *
 * A dependency is NOT a column, so it is carried inside the plan that needs it rather than beside it
 * in `calculatedFields`, which every downstream surface derives a projection and a header from.
 *
 * FLAT, not nested: a cyclic schema would otherwise build a cyclic object graph out of plans that
 * travel through DTOs and a cache. The field that CLOSES a loop is kept in the closure — dropped,
 * its reference falls through to the column resolver and renders a wrong column, silently.
 *
 * `undefined` rather than an empty array when a formula reads only columns.
 */
export function calculatedDependencyPlans(
  field: CalculatedSchemaField,
  schemaFields: readonly DataMartSchemaField[]
): CalculatedFieldPlan[] | undefined {
  const substitutable = substitutableFieldsByName(schemaFields);
  const plans: CalculatedFieldPlan[] = [];
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
 * `columnFilter` with each selected calculated-metric name removed. A metric renders through its
 * own channel, so leaving its name in a plain projection list double-handles it: once correctly,
 * once as a stray reference the header fallback does not know is already spoken for.
 */
export function excludeCalculatedFieldNames(
  columnFilter: readonly string[] | undefined,
  calculatedFieldNames: ReadonlySet<string>
): string[] | undefined {
  if (calculatedFieldNames.size === 0) return columnFilter as string[] | undefined;
  return columnFilter?.filter(name => !calculatedFieldNames.has(name));
}

/**
 * The `columnFilter` to hand a reader alongside a composed plan's `calculatedFields`. Binding the
 * two in one function is what stops a caller forwarding the metrics while forgetting to strip their
 * names.
 */
export function columnFilterWithoutCalculatedFields(
  columnFilter: readonly string[] | undefined,
  calculatedFields: readonly CalculatedFieldPlan[] | undefined
): string[] | undefined {
  return excludeCalculatedFieldNames(
    columnFilter,
    new Set((calculatedFields ?? []).map(metric => metric.outputName))
  );
}

/**
 * A calculated field inside a RECORD or STRUCT is a shape no consumer resolves: if the warehouse
 * later drops the container, the field is pruned with it. Rejected at save time rather than
 * silently disappearing later.
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
 * Calculated fields marked as part of the output Primary Key — which no calculated field can be,
 * because the PK is emitted as PHYSICAL COLUMN REFERENCES: `renderCountDistinctPrimaryKey` puts
 * each name through a plain `ColumnRefResolver`, so the formula is never substituted and the
 * warehouse is asked for a column that does not exist.
 *
 * The web hides the checkbox for a calculated row, so this arrives only over the API — where
 * nothing else refuses it. Reads the field's own flag rather than the reachable-PK helpers, which
 * answer a different question and would hide the case behind their own pruning.
 */
export function collectPrimaryKeyCalculatedFieldNames(
  fields: readonly DataMartSchemaField[]
): string[] {
  const names: string[] = [];
  const walk = (nodes: readonly DataMartSchemaField[]) => {
    for (const field of nodes) {
      if (isCalculatedField(field) && field.isPrimaryKey) names.push(field.name);
      if ('fields' in field && field.fields?.length) walk(field.fields as DataMartSchemaField[]);
    }
  };
  walk(fields);
  return names;
}

/**
 * Characters a calculated field's name may not hold, because the name is emitted as an output
 * identifier and quoted by the storage's escaper: `.` splits into qualifiers, a backtick and `"`
 * are quote characters the escaper doubles, `\` is a BigQuery escape sequence so `a\b` would name a
 * different column with nothing on screen to say so, and control characters survive no dialect's
 * quoting.
 *
 * A PHYSICAL column is not held to this — its name comes from the warehouse, not from a person, and
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
 * Top-level calculated fields sharing a name with another top-level field. Every consumer keys
 * fields by name through a last-wins `Map`, so the winner is decided by schema order. Two PHYSICAL
 * columns colliding is left alone — that is the warehouse's business.
 *
 * Compared CASE-INSENSITIVELY: Redshift folds delimited identifiers and Athena and Databricks
 * resolve them case-insensitively, so `Revenue` and `revenue` give a result set with two columns of
 * one name and every reader keeps one — a silently wrong number. BigQuery refuses the query
 * instead. Snowflake is the one storage where the pair is genuinely distinct; refusing it there too
 * is deliberate, since this check has no dialect to consult.
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
 * References of a calculated field that no longer resolve against `schemaFields`. These names go
 * verbatim into the error the query fails with.
 *
 * TRANSITIVE: what comes back may be a dependency rather than the field asked about, so consumers
 * must NOT phrase it as "gone from the Data Mart" — that name is right there in the schema, it just
 * cannot be computed.
 *
 * Resolves through `collectFormulaReferenceableFields`, NOT `collectSchemaFieldPathDescriptors`: a
 * field hidden from the reporting menu is still readable by a formula. Callers must pass the Data
 * Mart's OWN fields — a pre-filtered list reports every metric over a hidden column as broken.
 *
 * Joined references are skipped; `brokenJoinedReferencesOf` reports those.
 *
 * An unparseable formula is reported as broken rather than rethrown — this runs on every
 * `computeBlendableSchema`, and one bad persisted formula would 500 the whole schema.
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
 * - `calculated` — a formula of the JOINED Data Mart. Refused permanently, unlike a formula of the
 *   metric's own mart: `BlendedFieldDto` publishes only `isCalculated`, so neither the formula nor
 *   its level crosses that wire, and access checks read the READING formula's own text, so a source
 *   reachable only through the joined formula would be joined unchecked.
 * - `ambiguous` — it and another visible field of this join tree fold to one unified blended name,
 *   which `buildBlendedFieldIndex` refuses to resolve at report time.
 */
export type JoinedFieldState = 'ok' | 'hidden' | 'calculated' | 'ambiguous';

/** One joined source of the tree: whether this user may read it, and the state of each of its fields. */
export interface JoinedReferenceSource {
  /**
   * `AvailableSourceDto.isAccessibleForReporting` for the user this schema was computed for.
   * Refused here so the metric dialog can name the field; the composer's own refusal names none.
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
 * Builds that index from a blendable schema. ONE definition, so save time and composition time
 * cannot drift into letting a formula save and then fail to compose.
 *
 * Every source the tree exposes is indexed, INCLUDED OR NOT: `buildRelationshipChains` builds an
 * excluded source's join unconditionally, so its fields stay readable. INACCESSIBLE is carried per
 * source rather than dropped — the query genuinely cannot be built for this user, and saying so
 * beats reporting the path as if the join did not exist.
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
  // hidden calculated field would otherwise be reported as merely hidden.
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
 * Broken means the alias names no source, the source is no longer readable by this user, or the
 * field is gone / hidden / calculated / ambiguous — the same states save time refuses. A joined
 * `unique_count` is broken too: the measure exists but no slice can render it.
 *
 * Only LIVE references count. An unparseable formula returns nothing here — `brokenReferencesOf`
 * already reports the field itself.
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
 * Refused for the same reason a formula may not read one: `BlendedFieldDto` publishes
 * `isCalculated` and nothing else, so the joined mart's formula never crosses that wire. Left
 * alone, the blended path projects the field's `originalFieldName` from the joined mart's PHYSICAL
 * table — usually an unrecognised name, and a silently wrong number where that table happens to
 * carry a column of that name.
 *
 * `ownColumnNames` are the MAIN Data Mart's own field paths: a native column may legitimately own
 * the name a unified blended name folds to, and refusing it would take a column the report is
 * entitled to.
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
