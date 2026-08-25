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
 * The warehouse dry-run context for Task 10's second validation pass. Optional: a caller with no
 * warehouse access at hand (or a test exercising only the parser pass) may omit it, in which case
 * `validate` skips the warehouse check entirely and returns no `warehouseValidation` stamp.
 */
export interface DryRunContext {
  dataMart: DataMart;
  storageType: DataStorageType;
  credentials: DataStorageCredentials;
  config: DataStorageConfig;
}

/**
 * What resolving a joined reference's `path` needs. Deliberately NOT part of `DryRunContext`: a
 * join tree is a property of the Data Mart's relationships, not of its warehouse, so a Data Mart
 * whose storage is not configured yet — which gets no dry run at all — must still have its joined
 * paths checked. Optional only because the read is per-user: a caller with no user identity at
 * hand (an internal save) supplies none, and a joined path is then REFUSED rather than resolved
 * against a fabricated identity — the blendable schema's access pass PERSISTS a default role scope
 * for whatever user id it is handed, so inventing one writes a row for a user that does not exist.
 */
export interface JoinTreeContext {
  dataMartId: string;
  projectId: string;
  accessor: BlendableSchemaAccessor;
}

/**
 * `JoinedReferenceIndex` (built by `buildJoinedReferenceIndex`) is a deliberate SECOND index over
 * the blendable schema, beside `services/blended-field-index.ts`, because a formula resolves fields
 * differently from a report control: it keeps UNUSABLE fields (they are refused with a reason, not
 * silently unknown) and is keyed by the structural `(aliasPath, originalFieldName)` a `{{ref}}` tag
 * carries, not by the unified `<path>__<field>` name a column picker speaks. It still answers the
 * one question only the unified name can answer — two fields folding to ONE blended name, which
 * `buildBlendedFieldIndex` refuses at report time — by reading
 * `collectAmbiguousBlendedFieldNames`, which lives with that derivation.
 *
 * It lives in `calculated-field.utils.ts` so this save-time refusal and the composition-time
 * broken-state check (`brokenJoinedReferencesOf`) resolve a path IDENTICALLY — otherwise a formula
 * saves here and is called broken there, or the reverse.
 */

// Every executor (BigQuery, Snowflake, Redshift, Athena, Databricks) wraps its OWN warehouse call
// in a try/catch and resolves `isValid: false` for ANY exception it hits — a genuine ECONNRESET,
// timeout, DNS failure, or an expired OAuth token included — rather than rethrowing. So a thrown
// exception alone (see `dryRunMetrics`'s own catch) never sees a transient outage; it always
// arrives here as an ordinary, resolved, failed `SqlDryRunResult`, indistinguishable from a real
// SQL rejection unless something inspects the error text. This is a heuristic over that TEXT, not
// a structural signal — the clean fix is each executor reporting transport failures distinctly
// from SQL failures, which is out of this task's scope, so the boundary is drawn here, visibly,
// instead of silently blocking a save over a warehouse blip.
//
// Every clause must match something only a TRANSPORT failure says. A bare `\b5\d{2}\b` / `\b401\b`
// did not: they match any standalone three-digit number, and a warehouse quotes the offending SQL
// back — `Unrecognized name: clcks at [1:503]` carries one, and so can the analyst's own formula
// text. A genuine SQL rejection was then classified transient and the broken formula saved as
// `skipped`, which is the one outcome this heuristic must never produce. The HTTP-status reading
// is kept but anchored to status-like context, and the named statuses ("service unavailable",
// "bad gateway", …) below already cover the ordinary phrasings on their own.
const TRANSIENT_FAILURE_PATTERN =
  /ECONNRESET|ECONNREFUSED|ECONNABORTED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ESOCKETTIMEDOUT|EHOSTUNREACH|ENETUNREACH|ENETRESET|EPIPE|connection (reset|refused|closed|aborted)|socket hang ?up|timed? ?out|network (error|timeout|unreachable)|getaddrinfo|\bdns\b|invalid_grant|token (expired|refresh(ed)?)|unauthorized|authentication failed|failed to (refresh|obtain) (an? )?(access )?token|internal server error|service unavailable|bad gateway|gateway timeout|(?:\bhttps?\b|\bstatus ?(?:code)?\b)\W{0,10}(?:401|5\d{2})\b/i;

// The veto, and the reason the positive pattern above cannot stand alone: a warehouse quotes the
// OFFENDING SQL back, so every English phrase that pattern searches for can also arrive inside the
// analyst's own formula. A column named `dns` or `timeout`, or the literal 'unauthorized', turns
// any genuine rejection into `\bdns\b` / `timed? ?out` / `unauthorized` matching — and the formula
// is then saved as `skipped`, the one outcome this heuristic must never produce. Anchoring each
// clause the way the HTTP status was anchored does not close it, because the text being searched
// is partly the analyst's.
//
// So the question is asked the other way round: a message carrying any dialect's SQL-REJECTION
// marker is never transient, whatever else it says. Erring strict is deliberate and the asymmetry
// is not close — a blip misread as a SQL error costs the analyst a retry, while a SQL error
// misread as a blip silently ships a broken formula.
const SQL_REJECTION_PATTERN =
  /unrecognized name|syntax error|type not found|column_not_found|table_not_found|function_not_found|does not exist|cannot be resolved|sql compilation error|unresolved_column|analysisexception|invalid identifier|semantic analysis|line \d+:\d+/i;

function isTransientFailure(result: SqlDryRunResult): boolean {
  if (result.isValid) return false;
  const error = result.error ?? '';
  if (SQL_REJECTION_PATTERN.test(error)) return false;
  return TRANSIENT_FAILURE_PATTERN.test(error);
}

/**
 * How a set of formulas is split across composed dry-run queries: ONE batch, unless the set mixes a
 * row-level formula with an aggregate one that reads a joined Data Mart.
 *
 * The batch picks the BUILDER, so batching everything into one query (spec §6.1) let a single field
 * with a live joined reference route the whole plan through the blended path — where the row-level
 * fields that merely came along are refused as if they had been put on a report (spec §3.3/§4.4).
 * The rule is "batch what composes through the same builder", not "batch everything".
 *
 * Only the AGGREGATE half is tested for a joined reference, because a row-level formula can never
 * carry one: outside an aggregate call it is refused permanently at save
 * (FORMULA_JOINED_REFERENCE_ROW_LEVEL, spec §3.1), and inside one the formula aggregates. That
 * already holds here — the dry run runs only after a clean parser pass — which is what makes the
 * row-level batch's flat composition correct rather than merely cheaper.
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
 * invisible from either field alone, and both consumers need the whole shape — the cycle refusal
 * (D14) and the dependency ORDER the level derivation runs in (D13).
 *
 * A joined reference never enters it: it names another Data Mart's field, refused on its own terms
 * (D12), so calling it a cycle would name the wrong problem. Nor does a commented-out one — it is
 * not SQL, exactly as everywhere else this feature reads references. An unparseable formula
 * contributes no edges rather than throwing: its own FORMULA_SYNTAX is what reports it, and throwing
 * from here would lose every other field's verdict along with it.
 *
 * The graph's KEYS and `byName` are the same set of calculated fields by construction — `byName` has
 * had nested ones removed by the caller — so no calculated target can be an edge the walk then
 * treats as an unwalkable leaf.
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
   * Validates every calculated field in `schema`, and — despite the return type advertising only
   * a result object — REWRITES `schema` IN PLACE: on a clean parser pass, each calculated field's
   * `calculated.formula` is overwritten with its canonical spelling (see the comment above the
   * canonicalization loop below). Callers that pass a schema still bound for a save rely on
   * exactly this: `UpdateDataMartSchemaService` assigns the schema being validated onto
   * `dataMart.schema` BEFORE calling this method, so the in-place rewrite is what ends up
   * persisted; a caller that must not mutate its input should pass a deep copy.
   */
  async validate(
    schema: DataMartSchema,
    storageType: DataStorageType,
    ctx?: DryRunContext,
    joinTree?: JoinTreeContext
  ): Promise<FormulaValidationResult> {
    const calculated = calculatedFieldsOf(schema.fields);
    if (calculated.length === 0) return { errors: [], warnings: [] };

    // Collapse CR and CRLF to `\n` BEFORE anything reads the formula. The scanner now ends a line
    // comment at either terminator on its own, so this is the second lock, on the text that
    // PERSISTS: a stored formula can never carry a terminator the lexer and the warehouse would
    // read differently, whatever a future edit does to either. It has to run here rather than in
    // the canonicalization loop below, which is where every other rewrite lives: that loop runs
    // AFTER the analysis pass, and every span offset the analysis hands back is an index into this
    // string — rewriting it later would slide those offsets out from under their spans.
    for (const field of calculated) {
      field.calculated.formula = field.calculated.formula.replace(/\r\n?/g, '\n');
    }

    const dialect = await this.dialects.resolve(storageType);

    // References resolve against the schema BEING SAVED, not the stored one: a field added in the
    // same save must be referenceable, and one removed in it must fail. Hidden fields stay
    // referenceable here — isHiddenForReporting only takes a column off the reporting menu, it
    // does not remove it from the source, and computing is not projecting (spec §7).
    //
    // A NESTED calculated field is dropped: `collectFormulaReferenceableFields` recurses, so it can
    // yield a dotted `parent.child` carrying a formula, but nothing could substitute one at compose
    // time (the plan factories read `calculatedFieldsOf`, which does not recurse) and
    // `DataMartSchemaParserFacade` refuses that schema shape on every save path. Dropping it here
    // keeps this name map and the dependency graph's keys the same set of formulas.
    const topLevelCalculated = new Set<DataMartSchemaField>(calculated);
    const byName = new Map(
      collectFormulaReferenceableFields(schema.fields)
        .filter(d => !isCalculatedField(d.field) || topLevelCalculated.has(d.field))
        .map(d => [d.name, d.field])
    );

    // One lookup per save, not per formula: the join tree is the same for every metric in the
    // schema, and it is only read at all when some formula names a joined path in LIVE SQL — a
    // commented-out one must not be what sends this save looking at relationships.
    const joinTreeRead = await this.resolveJoinedReferences(calculated, joinTree);
    const joinedIndex = joinTreeRead?.index;

    const walk = walkFormulaDependencies(formulaDependencyGraph(calculated, byName));
    const errors: FormulaViolation[] = formulaCycleViolations(walk.cycles);
    const warnings: FormulaViolation[] = [];
    // Each field paired with the level its own analysis derived, so the in-place rewrite below can
    // write it back without re-analyzing. Kept beside the field rather than in a name-keyed map:
    // nothing guarantees field names are unique in a schema this pass has not finished judging.
    const analysed: { field: CalculatedSchemaField; level: CalculatedFieldLevel }[] = [];

    // The level each formula gets in THIS save — what `knownField` answers a calculated reference
    // from. Reading `field.calculated.level` instead would answer from the PREVIOUS save: the
    // rewrite below runs only after this whole loop, so editing `revenue` from row-level to
    // aggregating in the same save that adds `roas = revenue / cost` would classify `roas` from the
    // old answer. Wrong level, NO error, save clean, and the report silently collapses to a grand
    // total — D13, one seat earlier than compose time. Name-keyed because a reference is; duplicate
    // names are last-wins here, the same caveat the graph above already carries.
    const derivedLevels = new Map<string, CalculatedFieldLevel>();
    const analyses = new Map<
      CalculatedSchemaField,
      { errors: FormulaViolation[]; warnings: FormulaViolation[]; level: CalculatedFieldLevel }
    >();

    // Dependencies first, so a formula is only analysed once every formula it reads has a level.
    // A cyclic graph yields no order at all (that is what makes it unusable-by-construction rather
    // than by convention); its own violations above already fail the save before any level is
    // written, so schema order is a safe fallback.
    const orderIndex = new Map((walk.order ?? []).map((name, index) => [name, index]));
    const analysisOrder = [...calculated].sort(
      (a, b) => (orderIndex.get(a.name) ?? 0) - (orderIndex.get(b.name) ?? 0)
    );

    for (const field of analysisOrder) {
      // ReferenceState has no slot for the ways a JOINED reference can fail (an alias that names
      // no source, a source excluded from reporting, a hidden field), so those are flagged with
      // their own violations, out of band from the ReferenceState the callback returns. Keyed by
      // the reference label so a formula naming the same broken reference twice reports it once.
      const joinedViolations = new Map<string, FormulaViolation>();
      // Same out-of-band collection, for the OTHER reference this slice cannot render: a bare
      // `unique_count`, i.e. the metric's own Data Mart's Unique Count measure (below).
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
          // #6732: a formula MAY read another Calculated Field of this Data Mart, and what the
          // analyzer needs back is that field's LEVEL — an aggregate-level one is legal bare and
          // makes this formula a metric too, a row-level one is an ordinary column. Answered from
          // this save's derivation, never from the persisted level (see `derivedLevels`). An absent
          // entry means the walk could not order this reference (a cycle, which is already refused
          // above), and `isAggregateLevel` reads that the conservative way.
          if (!isCalculatedField(found)) return 'ok';
          return isAggregateLevel(derivedLevels.get(refField))
            ? 'calculated-metric'
            : 'calculated-column';
        }
        // No real column of this name in the schema being saved — only then does the bare token
        // read as the MAIN Data Mart's Unique Count measure. Spec §4.3 grants that meaning to a
        // JOINED source's Unique Count (`path` set), which is refused separately above, so
        // the main reading has no usable form: there is no such column, and the measure is an
        // output column of the very query the formula renders into, which no dialect can
        // reference from inside its own SELECT list. Rejected below rather than accepted and left
        // to fail at the warehouse on every run. A real column literally named "unique_count"
        // always wins over this reading (handled by the `byName` lookup above).
        if (refField === UNIQUE_COUNT_FIELD_TOKEN) {
          mainUniqueCountRefs.add(refField);
          // Still 'aggregate', not 'missing': it is not an absent column, and reporting it as one
          // would send the analyst looking for a field that was never supposed to exist.
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

    // Collected in SCHEMA order, not in the dependency order they were analysed in: what a client
    // reads is a list of violations against a schema it sent, and reordering it by a graph it
    // cannot see would make the same save report the same problems in a different order.
    for (const field of calculated) {
      const analysis = analyses.get(field);
      if (!analysis) continue;
      errors.push(...analysis.errors);
      warnings.push(...analysis.warnings);
      analysed.push({ field, level: analysis.level });
    }

    // The parser pass accepted every formula — canonicalize each one before it can reach a save.
    // A client (any client: the shipped web editor, a direct API call, a script, a future non-web
    // client) may submit a tag with attributes in any order, extra whitespace around `=`, or an
    // unknown extra key — the Handlebars AST `parseFormulaReferences` already tolerates all of
    // that, same as the backend always has. Re-emitting every reference through
    // `serializeFormulaReference` collapses all of that variation to ONE spelling — `ref` first,
    // `path` before `field` when present, one space, no strays — so whatever gets persisted always
    // has canonical spelling. This is what lets the web reader stay a strict, simple pattern
    // instead of chasing parity with this Handlebars grammar (see formula-authoring.ts on the web
    // side): it only ever has to read the one shape this function guarantees. Mutates each field's
    // formula in place, same as `warehouseValidation` is mutated by the caller below — both rely
    // on `calculated` aliasing the very field objects inside the schema that gets saved.
    //
    // `serializeFormulaReference` throws `FormulaReferenceSyntaxError` for a `path`/`field` value
    // containing a `"` — reachable here even though every field's parser pass above already
    // succeeded: Handlebars accepts a single-quoted or backslash-escaped `"` inside a value
    // (`field='a"b'`, `field="a\"b"`), and `analyzeFormula` only inspects LIVE references — a tag
    // sitting inside a SQL comment raises nothing there, yet `renderFormula` still walks the whole
    // stored string and hits it. Caught and converted the same way `analyzeFormula` converts its
    // own parse failure (see formula-analyzer.ts), so this stays the 400 the rest of the flow
    // already speaks instead of an uncaught 500 from the global exception filter.
    //
    // The DERIVED LEVEL is written in the same place and under the same gate, for the same reason:
    // it is a property of the formula, not a client's choice, so whatever a request carried is
    // overwritten here. The gate is not incidental — `analyzeFormula`'s Handlebars-syntax early
    // return reports 'column' for a formula it never parsed (so that "metric iff an aggregate call
    // was found" stays true on every path), and persisting that would turn an unreadable formula
    // into a row-level field that a later slice puts in a GROUP BY. It is written AFTER the rewrite
    // it accompanies, so the two per-field mutations are atomic: a field whose canonicalization
    // throws keeps both its original formula and its original level, rather than ending up
    // described by a level derived for text that was never accepted.
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

    // Our parser is not a SQL grammar — only the warehouse itself can catch a dialect-level
    // mistake (an unknown function, a bad cast) before a report ever runs. Only worth asking once
    // the parser pass is clean: a parser error already fails the save on its own, and a caller
    // with no warehouse access at hand (ctx omitted) gets parser-only validation.
    if (errors.length > 0 || !ctx) {
      return { errors, warnings };
    }

    // Composing a joined metric resolves each involved Data Mart's table reference, which for a
    // SQL-defined one runs CREATE OR REPLACE VIEW against the customer's warehouse. The combined
    // query and every per-metric attribution query below cover the same Data Marts, so they share
    // one memo: the view is refreshed once per SAVE, not once per composed query.
    const tableReferences: TableReferenceMemo = new Map();

    // Every metric in as few composed queries as their levels allow (see `dryRunBatches`; one for
    // all but a level-mixing joined schema): the cost is per SUBMISSION, not per fragment — Athena
    // and Redshift EXPLAIN is a real query submission with real latency, so a ten-metric save must
    // not become ten serial round trips (spec §6.1).
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

    // A combined failure names no field of ours, and naming the offending field is this
    // feature's whole promise — re-run per metric purely to attribute it. This slow path only
    // runs once something is already known to be broken.
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
    // The combined query failed but no single metric did in isolation — e.g. two formulas that
    // only conflict together. Report against the whole set rather than letting the save through
    // on that technicality; the message says so rather than implying this one field is broken.
    if (errors.length === 0) {
      errors.push(FormulaViolations.warehouseRejectedAsSet(calculated[0].name, combined.error));
    }
    return { errors, warnings };
  }

  /**
   * The join tree a joined reference resolves against, or `undefined` when this save has no
   * identity to read one with — in which case a joined reference is REFUSED, not waved through:
   * an unverified path stops being harmless the moment the builder routes it, where it becomes a
   * sleeve join against a CTE that does not exist, i.e. a failure on a report run, far from the
   * save that caused it.
   *
   * The `schema` travels back alongside the index so the dry run below composes against the SAME
   * join tree this pass validated against, rather than re-reading it (and possibly a different
   * one) per composed query.
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
      // 'ok' rather than 'missing' so the violation just recorded is not shadowed by a less
      // accurate FORMULA_UNKNOWN_REFERENCE. It does NOT suppress every other check: a refused
      // reference sitting outside any aggregate still draws FORMULA_LEVEL_MIXING as well, which
      // is correct — both statements about it are true.
      return 'ok';
    };

    if (!index) return refuse(FormulaViolations.joinedReferenceUnverified(metricName, label));

    const source = index.get(path);
    if (!source) return refuse(FormulaViolations.joinedPathNotFound(metricName, label, path));
    // Before anything about the FIELD: which of the source's fields exist is not something to
    // answer for a Data Mart this user may not read, and the composer's own refusal — a
    // whole-request envelope naming no field — is the shape this exists to replace.
    if (!source.isAccessible) {
      return refuse(FormulaViolations.joinedSourceNotAccessible(metricName, label, path));
    }

    const state = source.fields.get(refField);
    if (state === undefined) {
      // Same precedence as the main Data Mart's own measure: a real column of that name wins, and
      // only its absence lets the token read as the source's Unique Count.
      if (refField === UNIQUE_COUNT_FIELD_TOKEN) {
        violations.set(label, FormulaViolations.joinedUniqueCountReference(metricName, label));
        // 'aggregate', not 'missing': the measure exists, it just cannot be referenced here.
        return 'aggregate';
      }
      return refuse(FormulaViolations.joinedFieldUnknown(metricName, label, path));
    }
    if (state === 'hidden') return refuse(FormulaViolations.joinedFieldHidden(metricName, label));
    // The SAME code the analyzer raises for the metric's own Data Mart: "a formula cannot reference
    // another one" is one rule, and a joined formula is no more readable than a local one.
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
      // A verdict on the SQL outranks a batch that could not be reached: reporting 'unreachable'
      // over it would stamp `warehouseValidation: 'skipped'` on a formula already known broken.
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
    // The REAL composed query for this batch's metrics-only plan — the thing validated is the
    // thing that will execute, unlike a synthetic `SELECT <fragment>` that can pass while the real
    // report query, built through the full renderer, fails. A formula reading a joined Data Mart is
    // therefore composed through the BLENDED path, which needs the saving user's own accessor:
    // the blendable schema's access pass PERSISTS a default role scope for whatever user id it is
    // handed, so a fabricated one writes rows for a user that does not exist. The join tree
    // resolved for the parser pass rides along so a joined save reads it once, not once per
    // composed query (the per-metric attribution loop below composes one query per formula).
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
      // Composing the blended path is no longer pure computation: it resolves each involved Data
      // Mart's table reference, and for a SQL-defined one that is a real warehouse round trip
      // (CREATE OR REPLACE VIEW). An expired token, a brief outage or a service account that
      // cannot write to the joined Data Mart's dataset would otherwise propagate straight out of
      // the save — the one outcome decision 9 exists to prevent, and it would never even reach the
      // transient-failure handling below, which only sees the dry run itself.
      //
      // The split is deliberate and must stay narrow. A REFUSAL is a verdict on the formula (the
      // renderer's joined-reference guard, the composer's missing-identity guard, output-controls
      // validation, the joined-source access check) and must reach the analyst as a failed save;
      // laundering one into `'skipped'` would persist `warehouseValidation: 'skipped'` for a
      // formula we know is broken. Everything else at this point is infrastructure, which decision
      // 9 says must warn rather than block.
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
      // A resolved `isValid: false` whose error text LOOKS like a transport/availability failure
      // (see `TRANSIENT_FAILURE_PATTERN`) is not a verdict on the SQL either — every executor
      // converts its own network exceptions into exactly this shape instead of throwing.
      return isTransientFailure(result) ? 'unreachable' : result;
    } catch {
      // A thrown exception — e.g. a genuinely unhandled failure below the executor layer — gets
      // the same treatment: not a verdict on the SQL, so it must not block the save either.
      return 'unreachable';
    }
  }
}
