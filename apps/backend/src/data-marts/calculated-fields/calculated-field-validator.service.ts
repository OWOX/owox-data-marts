import { HttpException, Inject, Injectable } from '@nestjs/common';
import { TypeResolver } from '../../common/resolver/type-resolver';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartSchema, DataMartSchemaField } from '../data-storage-types/data-mart-schema.type';
import { collectFormulaReferenceableFields } from '../data-storage-types/data-mart-schema.utils';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataStorageCredentials } from '../data-storage-types/data-storage-credentials.type';
import { DataStorageConfig } from '../data-storage-types/data-storage-config.type';
import { SqlDryRunExecutorFacade } from '../data-storage-types/facades/sql-dry-run-executor.facade';
import { SqlDryRunResult } from '../dto/domain/sql-dry-run-result.dto';
import { ReportSqlComposerService } from '../services/report-sql-composer.service';
import {
  buildJoinedReferenceIndex,
  CalculatedSchemaField,
  calculatedFieldsOf,
  isCalculatedField,
  isRowLevelCalculatedField,
  type JoinedReferenceIndex,
} from './calculated-field.utils';
import { analyzeFormula, ReferenceState } from './formula-analyzer';
import { isAggregateLevel, type CalculatedFieldLevel } from './formula-level';
import {
  FORMULA_FUNCTION_DIALECT_RESOLVER,
  FormulaFunctionDialect,
} from './formula-function-dialect';
import { FormulaViolation, FormulaViolations } from './formula-violations';
import { UNIQUE_COUNT_FIELD_TOKEN } from '../dto/schemas/unique-count-sources';
import { scanSql } from './sql-token-scanner';
import {
  FormulaReference,
  FormulaReferenceSyntaxError,
  renderFormula,
  serializeFormulaReference,
  walkFormulaDependencies,
} from './formula-reference';
import {
  BlendableSchemaAccessor,
  BlendableSchemaService,
} from '../services/blendable-schema.service';
import { hasLiveJoinedReference, liveFormulaReferences } from './formula-live-reference';
import { BlendableSchemaDto } from '../dto/domain/blendable-schema.dto';
import type { TableReferenceMemo } from '../services/data-mart-table-reference.service';
import { buildBlendedFieldUnifiedName } from '../services/blended-field-name';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';

/**
 * The warehouse dry-run context. Optional: omitting it skips the warehouse check entirely and
 * returns no `warehouseValidation` stamp.
 */
export interface DryRunContext {
  dataMart: DataMart;
  storageType: DataStorageType;
  credentials: DataStorageCredentials;
  config: DataStorageConfig;
}

/**
 * What resolving a joined reference's `path` needs. Separate from `DryRunContext` because a join
 * tree belongs to the Data Mart's relationships, not its warehouse: a mart with no storage config
 * gets no dry run but must still have its paths checked.
 *
 * Optional because the read is per-user, and without an identity a joined path is REFUSED rather
 * than resolved against a fabricated one — the blendable schema's access pass PERSISTS a default
 * role scope for whatever user id it is handed.
 */
export interface JoinTreeContext {
  dataMartId: string;
  projectId: string;
  accessor: BlendableSchemaAccessor;
}

/**
 * `JoinedReferenceIndex` is a second index over the blendable schema, beside
 * `services/blended-field-index.ts`, because a formula resolves fields differently from a report
 * control: it KEEPS unusable fields, so they are refused with a reason rather than read as unknown,
 * and it is keyed by the structural `(aliasPath, originalFieldName)` a `{{ref}}` tag carries.
 *
 * It lives in `calculated-field.utils.ts` so this save-time refusal and the composition-time
 * broken-state check resolve a path IDENTICALLY.
 */

// Every executor resolves `isValid: false` for ANY exception — ECONNRESET, timeout, expired OAuth
// token included — rather than rethrowing, so a transport failure arrives here indistinguishable
// from a SQL rejection unless something reads the error TEXT. A heuristic, not a structural signal;
// the clean fix is each executor reporting transport failures distinctly.
//
// Every clause must match something only a TRANSPORT failure says. A bare `\b5\d{2}\b` did not: a
// warehouse quotes the offending SQL back, and `Unrecognized name: clcks at [1:503]` carries a
// three-digit number. The status reading is kept but anchored to status-like context.
const TRANSIENT_FAILURE_PATTERN =
  /ECONNRESET|ECONNREFUSED|ECONNABORTED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ESOCKETTIMEDOUT|EHOSTUNREACH|ENETUNREACH|ENETRESET|EPIPE|connection (reset|refused|closed|aborted)|socket hang ?up|timed? ?out|network (error|timeout|unreachable)|getaddrinfo|\bdns\b|invalid_grant|token (expired|refresh(ed)?)|unauthorized|authentication failed|failed to (refresh|obtain) (an? )?(access )?token|internal server error|service unavailable|bad gateway|gateway timeout|(?:\bhttps?\b|\bstatus ?(?:code)?\b)\W{0,10}(?:401|5\d{2})\b/i;

// The veto, and why the positive pattern cannot stand alone: a column named `dns` or `timeout`
// turns any genuine rejection into a match, because the text being searched is partly the
// analyst's. So the question is asked the other way round — a message carrying any dialect's
// SQL-REJECTION marker is never transient, whatever else it says.
//
// Erring strict is deliberate: a blip misread as a SQL error costs a retry, while a SQL error
// misread as a blip silently ships a broken formula.
const SQL_REJECTION_PATTERN =
  /unrecognized name|syntax error|type not found|column_not_found|table_not_found|function_not_found|does not exist|cannot be resolved|sql compilation error|unresolved_column|analysisexception|invalid identifier|semantic analysis|line \d+:\d+/i;

/**
 * The warehouse's error with everything the ANALYST authored blanked out, so the transient patterns
 * above are matched only against the warehouse's OWN words.
 *
 * The veto does not close the case where the analyst plants the wording as a VALUE:
 * `CAST('timed out' AS INT64)` is refused with `Bad int64 value: timed out`, which carries no
 * rejection marker. One such formula would switch the warehouse check off for every other
 * calculated field in the same save, so the contents of a formula's quoted literals and the field's
 * own name are removed first.
 */
function withoutAnalystText(error: string, fields: readonly CalculatedSchemaField[]): string {
  const MIN_MASKABLE = 3;
  const mask = (masked: string, text: string): string =>
    text.length >= MIN_MASKABLE ? masked.split(text).join(' ') : masked;

  let masked = error;
  for (const field of fields) {
    for (const token of scanSql(field.calculated.formula)) {
      if (token.kind !== 'string' && token.kind !== 'quotedIdentifier') continue;
      masked = mask(masked, token.value.slice(1, -1));
    }
    masked = mask(masked, field.name);
  }
  return masked;
}

function isTransientFailure(
  result: SqlDryRunResult,
  fields: readonly CalculatedSchemaField[]
): boolean {
  if (result.isValid) return false;
  const error = result.error ?? '';
  if (SQL_REJECTION_PATTERN.test(error)) return false;
  return TRANSIENT_FAILURE_PATTERN.test(withoutAnalystText(error, fields));
}

/**
 * How a set of formulas is split across composed dry-run queries: ONE batch, unless the set mixes a
 * row-level formula with an aggregate one that reads a joined Data Mart.
 *
 * The batch picks the BUILDER: batching everything into one query let a single field with a live
 * joined reference route the whole plan through the blended path, where the row-level fields that
 * merely came along are refused as if they had been put on a report.
 *
 * Only the AGGREGATE half is tested for a joined reference, because a row-level formula can never
 * carry one — outside an aggregate call it is refused at save, and inside one the formula
 * aggregates.
 */
function dryRunBatches(
  fields: readonly CalculatedSchemaField[]
): readonly (readonly CalculatedSchemaField[])[] {
  const rowLevel = fields.filter(isRowLevelCalculatedField);
  if (rowLevel.length === 0) return [fields];

  const aggregate = fields.filter(field => !isRowLevelCalculatedField(field));
  if (!aggregate.some(field => hasLiveJoinedReference(field.calculated.formula))) return [fields];

  return [aggregate, rowLevel];
}

/**
 * `field name → the calculated fields its formula reads`, for the schema's OWN calculated fields.
 *
 * One graph over the whole schema rather than a check inside the per-field loop: `a → b → a` is
 * invisible from either field alone, and both consumers need the whole shape.
 *
 * A joined reference never enters it — calling it a cycle would name the wrong problem — nor does a
 * commented-out one. An unparseable formula contributes no edges rather than throwing, so one bad
 * formula does not lose every other field's verdict.
 */
function formulaDependencyGraph(
  fields: readonly CalculatedSchemaField[],
  byName: ReadonlyMap<string, DataMartSchemaField>
): ReadonlyMap<string, readonly string[]> {
  const dependenciesOf = (field: CalculatedSchemaField): string[] => {
    let references: FormulaReference[];
    try {
      references = liveFormulaReferences(field.calculated.formula);
    } catch {
      return [];
    }
    const named = references
      .filter(ref => !ref.path)
      .map(ref => ref.field)
      .filter(name => {
        const found = byName.get(name);
        return found !== undefined && isCalculatedField(found);
      });
    return [...new Set(named)];
  };

  return new Map(fields.map(field => [field.name, dependenciesOf(field)]));
}

/** Every loop the walk found, reported against each field on it. */
function formulaCycleViolations(cycles: readonly string[][]): FormulaViolation[] {
  return cycles.flatMap(chain => {
    const members = [...new Set(chain)];
    return members.map(name =>
      members.length === 1
        ? FormulaViolations.selfReference(name)
        : FormulaViolations.circularReference(name, chain)
    );
  });
}

export interface FormulaValidationResult {
  errors: FormulaViolation[];
  warnings: FormulaViolation[];
  /**
   * Set only when `ctx` was supplied AND the parser pass found no errors: `'passed'` once the
   * warehouse accepts the combined dry-run query, `'skipped'` when the warehouse was unreachable.
   * Absent when `ctx` is omitted, when the parser pass already failed (the dry run never runs), or
   * when the warehouse rejected the formula (the resulting `errors` already say why).
   */
  warehouseValidation?: 'passed' | 'skipped';
}

@Injectable()
export class CalculatedFieldValidatorService {
  constructor(
    @Inject(FORMULA_FUNCTION_DIALECT_RESOLVER)
    private readonly dialects: TypeResolver<DataStorageType, FormulaFunctionDialect>,
    private readonly composer: ReportSqlComposerService,
    private readonly dryRunFacade: SqlDryRunExecutorFacade,
    private readonly blendableSchemaService: BlendableSchemaService
  ) {}

  /**
   * Validates every calculated field in `schema` and, despite the return type, REWRITES `schema`
   * IN PLACE: on a clean parser pass each formula is overwritten with its canonical spelling.
   * `UpdateDataMartSchemaService` relies on exactly that — it assigns the schema onto
   * `dataMart.schema` before calling this. A caller that must not mutate its input passes a copy.
   */
  async validate(
    schema: DataMartSchema,
    storageType: DataStorageType,
    ctx?: DryRunContext,
    joinTree?: JoinTreeContext
  ): Promise<FormulaValidationResult> {
    const calculated = calculatedFieldsOf(schema.fields);
    if (calculated.length === 0) return { errors: [], warnings: [] };

    for (const field of calculated) {
      field.calculated.formula = field.calculated.formula.replace(/\r\n?/g, '\n');
    }

    const dialect = await this.dialects.resolve(storageType);
    const topLevelCalculated = new Set<DataMartSchemaField>(calculated);
    const byName = new Map(
      collectFormulaReferenceableFields(schema.fields)
        .filter(d => !isCalculatedField(d.field) || topLevelCalculated.has(d.field))
        .map(d => [d.name, d.field])
    );

    const joinTreeRead = await this.resolveJoinedReferences(calculated, joinTree);
    const joinedIndex = joinTreeRead?.index;

    const walk = walkFormulaDependencies(formulaDependencyGraph(calculated, byName));
    const errors: FormulaViolation[] = formulaCycleViolations(walk.cycles);
    const warnings: FormulaViolation[] = [];
    const analysed: { field: CalculatedSchemaField; level: CalculatedFieldLevel }[] = [];
    const derivedLevels = new Map<string, CalculatedFieldLevel>();
    const analyses = new Map<
      CalculatedSchemaField,
      { errors: FormulaViolation[]; warnings: FormulaViolation[]; level: CalculatedFieldLevel }
    >();
    const orderIndex = new Map((walk.order ?? []).map((name, index) => [name, index]));
    const analysisOrder = [...calculated].sort(
      (a, b) => (orderIndex.get(a.name) ?? 0) - (orderIndex.get(b.name) ?? 0)
    );

    for (const field of analysisOrder) {
      const joinedViolations = new Map<string, FormulaViolation>();
      const mainUniqueCountRefs = new Set<string>();

      const knownField = (path: string, refField: string): ReferenceState => {
        if (path) {
          return this.resolveJoinedReference(
            field.name,
            path,
            refField,
            joinedIndex,
            joinedViolations
          );
        }
        const found = byName.get(refField);
        if (found) {
          if (!isCalculatedField(found)) return 'ok';
          return isAggregateLevel(derivedLevels.get(refField))
            ? 'calculated-metric'
            : 'calculated-column';
        }
        if (refField === UNIQUE_COUNT_FIELD_TOKEN) {
          mainUniqueCountRefs.add(refField);
          return 'aggregate';
        }
        return 'missing';
      };

      const analysis = analyzeFormula({
        fieldName: field.name,
        formula: field.calculated.formula,
        dialect,
        knownField,
      });

      analyses.set(field, {
        errors: [
          ...joinedViolations.values(),
          ...[...mainUniqueCountRefs].map(ref =>
            FormulaViolations.mainUniqueCountReference(field.name, ref)
          ),
          ...analysis.errors,
        ],
        warnings: analysis.warnings,
        level: analysis.level,
      });
      derivedLevels.set(field.name, analysis.level);
    }

    for (const field of calculated) {
      const analysis = analyses.get(field);
      if (!analysis) continue;
      errors.push(...analysis.errors);
      warnings.push(...analysis.warnings);
      analysed.push({ field, level: analysis.level });
    }

    if (errors.length === 0) {
      for (const { field, level } of analysed) {
        try {
          field.calculated.formula = renderFormula(
            field.calculated.formula,
            serializeFormulaReference
          );
          field.calculated.level = level;
        } catch (e) {
          if (!(e instanceof FormulaReferenceSyntaxError)) throw e;
          errors.push(
            FormulaViolations.syntax(
              field.name,
              `The formula could not be canonicalized: ${e.message}`
            )
          );
        }
      }
    }

    if (errors.length > 0 || !ctx) {
      return { errors, warnings };
    }

    const tableReferences: TableReferenceMemo = new Map();

    const combined = await this.dryRunMetrics(
      calculated,
      ctx,
      joinTree,
      joinTreeRead?.schema,
      tableReferences
    );
    if (combined === 'unreachable') {
      warnings.push(FormulaViolations.warehouseCheckSkipped(calculated.map(f => f.name)));
      return { errors, warnings, warehouseValidation: 'skipped' };
    }
    if (combined.isValid) {
      return { errors, warnings, warehouseValidation: 'passed' };
    }

    for (const field of calculated) {
      const single = await this.dryRunMetrics(
        [field],
        ctx,
        joinTree,
        joinTreeRead?.schema,
        tableReferences
      );
      if (single !== 'unreachable' && !single.isValid) {
        errors.push(
          FormulaViolations.warehouseRejected(field.name, single.error ?? combined.error)
        );
      }
    }
    if (errors.length === 0) {
      errors.push(FormulaViolations.warehouseRejectedAsSet(calculated[0].name, combined.error));
    }
    return { errors, warnings };
  }

  /**
   * The join tree a joined reference resolves against, or `undefined` when this save has no
   * identity to read one with — a joined reference is then REFUSED rather than waved through,
   * because an unverified path becomes a sleeve join against a CTE that does not exist, failing on
   * a report run far from the save that caused it.
   *
   * The `schema` travels back alongside the index so the dry run composes against the SAME join
   * tree this pass validated against.
   */
  private async resolveJoinedReferences(
    fields: readonly CalculatedSchemaField[],
    joinTree?: JoinTreeContext
  ): Promise<{ schema: BlendableSchemaDto; index: JoinedReferenceIndex } | undefined> {
    if (!joinTree?.accessor.userId) return undefined;
    if (!fields.some(f => hasLiveJoinedReference(f.calculated.formula))) return undefined;

    const blendable = await this.blendableSchemaService.computeBlendableSchema(
      joinTree.dataMartId,
      joinTree.projectId,
      joinTree.accessor
    );

    return { schema: blendable, index: buildJoinedReferenceIndex(blendable) };
  }

  private resolveJoinedReference(
    metricName: string,
    path: string,
    refField: string,
    index: JoinedReferenceIndex | undefined,
    violations: Map<string, FormulaViolation>
  ): ReferenceState {
    const label = `${path}.${refField}`;

    const refuse = (violation: FormulaViolation): ReferenceState => {
      violations.set(label, violation);
      return 'ok';
    };

    if (!index) return refuse(FormulaViolations.joinedReferenceUnverified(metricName, label));

    const source = index.get(path);
    if (!source) return refuse(FormulaViolations.joinedPathNotFound(metricName, label, path));
    if (!source.isAccessible) {
      return refuse(FormulaViolations.joinedSourceNotAccessible(metricName, label, path));
    }

    const state = source.fields.get(refField);
    if (state === undefined) {
      if (refField === UNIQUE_COUNT_FIELD_TOKEN) {
        violations.set(label, FormulaViolations.joinedUniqueCountReference(metricName, label));
        return 'aggregate';
      }
      return refuse(FormulaViolations.joinedFieldUnknown(metricName, label, path));
    }
    if (state === 'hidden') return refuse(FormulaViolations.joinedFieldHidden(metricName, label));
    if (state === 'calculated') {
      return refuse(FormulaViolations.calculatedReference(metricName, label));
    }
    if (state === 'ambiguous') {
      return refuse(
        FormulaViolations.joinedFieldAmbiguous(
          metricName,
          label,
          buildBlendedFieldUnifiedName(path, refField)
        )
      );
    }
    return 'ok';
  }

  /**
   * The warehouse's verdict on `fields`, over as few composed queries as their levels allow (see
   * `dryRunBatches`). One batch is the ordinary case and behaves exactly as a single dry run.
   */
  private async dryRunMetrics(
    fields: readonly CalculatedSchemaField[],
    ctx: DryRunContext,
    joinTree?: JoinTreeContext,
    blendableSchema?: BlendableSchemaDto,
    tableReferences?: TableReferenceMemo
  ): Promise<SqlDryRunResult | 'unreachable'> {
    let unreachable = false;
    let accepted: SqlDryRunResult | 'unreachable' = 'unreachable';

    for (const batch of dryRunBatches(fields)) {
      const result = await this.dryRunBatch(batch, ctx, joinTree, blendableSchema, tableReferences);
      if (result === 'unreachable') {
        unreachable = true;
        continue;
      }
      if (!result.isValid) return result;
      accepted = result;
    }

    return unreachable ? 'unreachable' : accepted;
  }

  private async dryRunBatch(
    fields: readonly CalculatedSchemaField[],
    ctx: DryRunContext,
    joinTree?: JoinTreeContext,
    blendableSchema?: BlendableSchemaDto,
    tableReferences?: TableReferenceMemo
  ): Promise<SqlDryRunResult | 'unreachable'> {
    let sql: string;
    try {
      ({ sql } = await this.composer.composeMetricsOnly(
        ctx.dataMart,
        fields.map(f => f.name),
        joinTree?.accessor,
        blendableSchema,
        tableReferences
      ));
    } catch (e) {
      if (e instanceof BusinessViolationException || e instanceof HttpException) throw e;
      return 'unreachable';
    }
    try {
      const result = await this.dryRunFacade.execute(
        ctx.storageType,
        ctx.credentials,
        ctx.config,
        sql
      );
      return isTransientFailure(result, fields) ? 'unreachable' : result;
    } catch {
      return 'unreachable';
    }
  }
}
