import { AggregationRule } from '../dto/schemas/aggregation-config.schema';
import { ReportAggregateFunction } from '../dto/schemas/aggregate-function.schema';
import {
  pickAutoAggregation,
  resolveFieldGovernance,
  type AggregationRole,
} from '../dto/schemas/field-aggregation-governance';
import { categorizeFieldType, mayDivideAsWholeNumbers } from '../dto/schemas/field-type-category';
import { integerDivisionTruncates } from '../data-storage-types/enums/data-storage-type.enum';
import { collectSchemaFieldPathDescriptors } from '../data-storage-types/data-mart-schema.utils';
import { normalizeUniqueCountSources } from '../dto/schemas/unique-count-sources';
import {
  calculatedFieldLevelOf,
  calculatedFieldsOf,
  isCalculatedField,
} from '../calculated-fields/calculated-field.utils';
import { liveFormulaReferences } from '../calculated-fields/formula-live-reference';
import { isAggregateLevel } from '../calculated-fields/formula-level';
import {
  liftFormulaToGroupLevel,
  LIFT_AGGREGATION,
  type LiftableReference,
} from '../calculated-fields/formula-lifting';
import { isUniversalAggregateFunction } from '../calculated-fields/formula-function-dialect';
import type {
  DataMartSchema,
  DataMartSchemaField,
} from '../data-storage-types/data-mart-schema.type';
import type { DataMart } from '../entities/data-mart.entity';
import type { ReportLike, ReportLikeReadPlan } from '../dto/domain/report-like-read-plan';

export type AutoCollapseSkipReason =
  | 'analyst-aggregated'
  | 'no-explicit-projection'
  | 'non-groupable-column'
  | 'unresolvable-column'
  | 'no-allowed-aggregation'
  | 'calculated-not-liftable'
  // A sort the collapsed shape cannot resolve: either the column is not projected, or it renders
  // as an expression that the projection does not contain.
  | 'sort-outside-projection';

export interface LiftedCalculatedFormula {
  column: string;
  formula: string;
}

export type AutoCollapsePlan =
  | { kind: 'none'; reason: AutoCollapseSkipReason }
  | { kind: 'distinct' }
  | {
      kind: 'aggregate';
      aggregations: AggregationRule[];
      /** May be set while `aggregations` is empty: a lifted formula alone makes the query aggregated. */
      liftedFormulas?: LiftedCalculatedFormula[];
    };

type SchemaFieldDescriptor = ReturnType<typeof collectSchemaFieldPathDescriptors>[number];

/**
 * Pure and total. Aborts as a whole: a half-collapsed report would let the surviving duplicates
 * multiply whatever was aggregated.
 */
export function resolveAutoCollapse(report: ReportLike): AutoCollapsePlan {
  const columns = report.columnConfig;
  if (!columns?.length) return { kind: 'none', reason: 'no-explicit-projection' };

  const schemaFields = report.dataMart.schema?.fields ?? [];
  const descriptors = collectSchemaFieldPathDescriptors(schemaFields);
  const byName = new Map(descriptors.map(d => [d.name, d]));

  // Each of these already puts the query on the aggregated branch.
  if (
    (report.aggregationConfig?.length ?? 0) > 0 ||
    (report.dateTruncConfig?.length ?? 0) > 0 ||
    normalizeUniqueCountSources(report.uniqueCountConfig).length > 0 ||
    filtersAnAggregateCalculatedField(report.filterConfig, byName, schemaFields)
  ) {
    return { kind: 'none', reason: 'analyst-aggregated' };
  }

  // A sort on an unprojected column is valid while ungrouped and invalid once collapsed — every
  // dialect rejects it under both DISTINCT and GROUP BY.
  const projectedColumns = new Set(columns);
  if ((report.sortConfig ?? []).some(rule => !projectedColumns.has(rule.column))) {
    return { kind: 'none', reason: 'sort-outside-projection' };
  }

  // No storage loaded answers "truncates".
  const truncatesDivision = integerDivisionTruncates(report.dataMart.storage?.type);

  const aggregations: AggregationRule[] = [];
  const liftedFormulas: LiftedCalculatedFormula[] = [];
  for (const name of columns) {
    const descriptor = byName.get(name);
    // A joined column, a hidden one, or a name the schema has since lost: we cannot read its type,
    // so we cannot tell a dimension from a metric. Treating it as a dimension would make it a
    // grouping key — and grouping by a metric drops its duplicate rows, which changes that
    // column's total exactly as DISTINCT would. Joined fields are #6926's subject; until then a
    // report that projects one is left alone.
    if (!descriptor) return { kind: 'none', reason: 'unresolvable-column' };

    if (categorizeFieldType(descriptor.type) === 'other') {
      return { kind: 'none', reason: 'non-groupable-column' };
    }

    // Already aggregates, so the report is already on the aggregated branch.
    if (aggregatesByItself(descriptor.field, schemaFields)) {
      return { kind: 'none', reason: 'analyst-aggregated' };
    }

    const governance = resolveFieldGovernance(descriptor.type, {
      aggregationRole: descriptor.field.aggregationRole as AggregationRole | undefined,
      allowedAggregations: descriptor.field.allowedAggregations as
        | ReportAggregateFunction[]
        | undefined,
    });
    // A calculated dimension collapses by being grouped; lifting it would discard the grouping.
    if (governance.role !== 'metric') continue;

    if (isCalculatedField(descriptor.field)) {
      // Nested in a RECORD: the plan factories read top-level fields only, so a lift would be
      // built and then silently ignored.
      if (descriptor.name !== descriptor.field.name) {
        return { kind: 'none', reason: 'calculated-not-liftable' };
      }
      // Only emptiness is meaningful here: the lift aggregates the field's references, not the
      // field, so a narrowed set has nothing to constrain.
      if (governance.allowedAggregations.length === 0) {
        return { kind: 'none', reason: 'no-allowed-aggregation' };
      }
      // The lift rewrites this field's formula to group level, and the filter router re-derives
      // the level from that text — so a WHERE on the row-level value would silently become a
      // HAVING on the group total, keeping a different set of rows. A sort would likewise reorder
      // by a value no row ever held. Neither is ours to decide: refuse instead.
      if (referencedByFilterOrSort(name, report)) {
        return { kind: 'none', reason: 'calculated-not-liftable' };
      }
      // The same rewrite reaches every OTHER formula that reads this column, because the composer
      // re-derives each level from the same clone. A dimension built on it stops being a grouping
      // key; a filter on it moves to HAVING one hop away from the check above. Both are invisible
      // from the original schema, so a dependent means the whole report is left alone.
      if (readByAnotherCalculatedField(name, schemaFields)) {
        return { kind: 'none', reason: 'calculated-not-liftable' };
      }
      // A calculated field carries no governance of its own, so the numeric priority would SUM a
      // ratio. Lift the formula instead, and refuse the whole report when it cannot be lifted.
      const lifted = liftFormulaToGroupLevel(
        descriptor.field.calculated.formula,
        (refPath, refField) => liftableReference(byName, refPath, refField, truncatesDivision),
        // The same predicate `calculatedFieldLevelOf` uses to re-derive the level from this text.
        isUniversalAggregateFunction
      );
      if (lifted.formula === null) return { kind: 'none', reason: 'calculated-not-liftable' };
      liftedFormulas.push({ column: name, formula: lifted.formula });
      continue;
    }

    const fn = pickAutoAggregation(descriptor.type, governance.allowedAggregations);
    if (!fn) return { kind: 'none', reason: 'no-allowed-aggregation' };
    aggregations.push({ column: name, function: fn });
  }

  // Nothing to aggregate, so collapsing is exactly DISTINCT and cannot change a value.
  if (aggregations.length === 0 && liftedFormulas.length === 0) {
    // With one exception. A sort on a numeric-declared calculated field renders as
    // `ORDER BY CAST(<expr> AS <type>)` — never the alias, so that Redshift resolves it — and that
    // expression is not among the DISTINCT items, which BigQuery, Athena/Trino and Redshift all
    // reject. The aggregated shape is unaffected: there the same field is a GROUP BY key and the
    // ordering expression is built from one.
    if (sortsACastCalculatedField(report, byName)) {
      return { kind: 'none', reason: 'sort-outside-projection' };
    }
    return { kind: 'distinct' };
  }
  return {
    kind: 'aggregate',
    aggregations,
    ...(liftedFormulas.length > 0 ? { liftedFormulas } : {}),
  };
}

/**
 * Whether a sort names a calculated field whose declared type imposes a comparison cast.
 *
 * The cast tables are per dialect, but every one of them holds numeric declarations only — a
 * formula declared FLOAT would otherwise sort lexicographically — so the category answers this
 * without the resolver learning a storage.
 */
function sortsACastCalculatedField(
  report: ReportLike,
  byName: ReadonlyMap<string, SchemaFieldDescriptor>
): boolean {
  return (report.sortConfig ?? []).some(rule => {
    const descriptor = byName.get(rule.column);
    return (
      descriptor !== undefined &&
      isCalculatedField(descriptor.field) &&
      categorizeFieldType(descriptor.type) === 'number'
    );
  });
}

/**
 * Whether another calculated field reads this column.
 *
 * DIRECT readers are enough, and that is not an approximation: lifting rewrites this column's
 * formula on a clone, every level downstream is re-derived from that clone, and so a direct reader
 * is already rewritten — one is all it takes to refuse. A chain `c -> b -> a` is caught at `b`
 * before `c` is ever reached.
 */
function readByAnotherCalculatedField(
  column: string,
  schemaFields: readonly DataMartSchemaField[]
): boolean {
  return calculatedFieldsOf(schemaFields).some(field => {
    if (field.name === column) return false;
    try {
      return liveFormulaReferences(field.calculated.formula).some(
        ref => !ref.path && ref.field === column
      );
    } catch {
      // An unparseable formula reports nothing, the same degradation every other reader makes.
      return false;
    }
  });
}

/** Whether any output control names this column, whatever it asks of it. */
function referencedByFilterOrSort(column: string, report: ReportLike): boolean {
  return (
    (report.filterConfig ?? []).some(rule => rule.column === column) ||
    (report.sortConfig ?? []).some(rule => rule.column === column)
  );
}

/**
 * Filtering on an aggregate-level calculated field already forces a GROUP BY with a HAVING, so the
 * report is collapsed before we look at it.
 */
function filtersAnAggregateCalculatedField(
  filterConfig: ReportLike['filterConfig'],
  byName: ReadonlyMap<string, SchemaFieldDescriptor>,
  schemaFields: readonly DataMartSchemaField[]
): boolean {
  return (filterConfig ?? []).some(rule =>
    aggregatesByItself(byName.get(rule.column)?.field, schemaFields)
  );
}

/**
 * Re-derived, never read off the field: `blendable-schema.service.ts` says outright that a stored
 * `level` is a cache actualization does not maintain, and the builders route the filter by the
 * DERIVED level. A field recorded `column` whose formula now aggregates would otherwise land in
 * HAVING while this resolver read it as row-level and collapsed anyway — the double aggregation
 * the check exists to prevent.
 */
function aggregatesByItself(
  field: DataMartSchemaField | undefined,
  schemaFields: readonly DataMartSchemaField[]
): boolean {
  if (field === undefined || !isCalculatedField(field)) return false;
  return isAggregateLevel(calculatedFieldLevelOf(field, schemaFields));
}

/**
 * What the lift may do with one reference, or `undefined` to refuse the whole lift. Governance
 * gates but does not choose: the rewrite recomputes the formula from group totals, and only a SUM
 * is a group total. Both facts are resolved here so the lift sees no type or storage name.
 */
function liftableReference(
  byName: ReadonlyMap<string, SchemaFieldDescriptor>,
  refPath: string,
  refField: string,
  truncatesDivision: boolean
): LiftableReference | undefined {
  // Only the main Data Mart's governance is ours to read.
  if (refPath !== '') return undefined;

  const target = byName.get(refField);
  // Hidden and disconnected fields are pruned from the menu, so this refuses a formula that may
  // legally read one — costing a collapse, never a number.
  if (!target) return undefined;

  // A calculated dependency may aggregate anywhere down its chain; wrapping it would nest aggregates.
  if (isCalculatedField(target.field)) return undefined;

  const governance = resolveFieldGovernance(target.type, {
    aggregationRole: target.field.aggregationRole as AggregationRole | undefined,
    allowedAggregations: target.field.allowedAggregations as ReportAggregateFunction[] | undefined,
  });
  // A dimension has no aggregate that preserves what the row-level text meant.
  if (governance.role !== 'metric') return undefined;
  if (!governance.allowedAggregations.includes(LIFT_AGGREGATION)) return undefined;

  return {
    truncatesUnderDivision: truncatesDivision && mayDivideAsWholeNumbers(target.type),
  };
}

/** Returns a clone: the stored entity must never gain an `aggregationConfig` it did not have. */
export function applyAutoCollapse<T extends ReportLike>(
  report: T
): { report: T; plan: AutoCollapsePlan } {
  const plan = resolveAutoCollapse(report);
  if (plan.kind === 'none') return { report, plan };
  if (plan.kind === 'distinct') return { report: patched(report, { distinct: true }), plan };
  const lifted = withLiftedFormulas(report, plan.liftedFormulas);
  return { report: patched(lifted, { aggregationConfig: plan.aggregations }), plan };
}

/**
 * A spread would drop the prototype, and `Report` exposes `ownerIds` as an accessor and
 * `isEmailBasedDestination` as a method — both silently `undefined` on a plain object, which no
 * compiler catches because the spread's type is still `T`. Same reason `withLiftedFormulas` keeps
 * the `DataMart` prototype.
 */
function patched<T extends ReportLike>(report: T, patch: Partial<ReportLikeReadPlan>): T {
  return Object.assign(Object.create(Object.getPrototypeOf(report) as object) as T, report, patch);
}

/**
 * Substitutes each lifted formula into a clone of the schema, which is also what flips the field
 * from a GROUP BY key to an aggregate — the composer re-derives the level from the formula text.
 */
function withLiftedFormulas<T extends ReportLike>(
  report: T,
  lifted: readonly LiftedCalculatedFormula[] | undefined
): T {
  if (!lifted?.length) return report;
  const schema = report.dataMart.schema;
  if (!schema) return report;

  const formulaByName = new Map(lifted.map(entry => [entry.column, entry.formula]));
  const fields = (schema.fields as DataMartSchemaField[]).map(field => {
    const formula = formulaByName.get(field.name);
    return formula !== undefined && isCalculatedField(field)
      ? { ...field, calculated: { ...field.calculated, formula } }
      : field;
  });

  // Keeps the prototype: `DataMart` exposes its owner ids as accessors, which a spread would drop.
  const dataMart = Object.assign(
    Object.create(Object.getPrototypeOf(report.dataMart) as object) as DataMart,
    report.dataMart,
    { schema: { ...schema, fields } as DataMartSchema }
  );
  // Through `patched` for the same reason it exists: a spread here would undo on the lift path
  // exactly the prototype the DataMart clone above is careful to keep.
  return patched(report, { dataMart } as Partial<ReportLikeReadPlan>);
}
