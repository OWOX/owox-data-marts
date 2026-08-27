import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { CalculatedFieldValidatorService } from '../calculated-fields/calculated-field-validator.service';
import { isCalculatedField } from '../calculated-fields/calculated-field.utils';
import { FormulaViolation, FormulaViolations } from '../calculated-fields/formula-violations';
import { DataMartSchema, DataMartSchemaField } from '../data-storage-types/data-mart-schema.type';
import { DataMartSchemaFieldStatus } from '../data-storage-types/enums/data-mart-schema-field-status.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { storageFieldTypesFor } from '../data-storage-types/field-aggregation';
import {
  ValidateFormulaCommand,
  type DraftCalculatedField,
} from '../dto/domain/validate-formula.command';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { DataMartService } from '../services/data-mart.service';

export interface ValidateFormulaResult {
  /** What is wrong with the submitted formula itself. */
  errors: FormulaViolation[];
  /** Non-blocking advisories about the submitted formula, e.g. an unguarded division. */
  warnings: FormulaViolation[];
  /**
   * What ELSE would refuse the save, filed under the field that OWNS it rather than the one that
   * caused it: converting a column into a metric makes every formula referencing it illegal, and
   * each violation belongs to its own field.
   *
   * Carries NO baseline, so it cannot tell a metric this edit broke from one that was already
   * broken. A client may therefore say the save will fail and name the field, but not that this
   * edit is the reason.
   */
  otherFieldErrors: FormulaViolation[];
}

/**
 * What the parser pass reads out of a `DataMartSchema`: its fields, and nothing else. Naming that
 * as a type is what lets `buildProbeSchema` be honest for a Data Mart whose schema was never
 * actualized, where there is no truthful discriminator to invent.
 */
type FormulaProbeSchema = { fields: DataMartSchemaField[] };

/**
 * The formula editor's live channel: what is wrong with ONE formula, answered without asking the
 * warehouse.
 *
 * Not a second validator — `CalculatedFieldValidatorService.validate` already skips the dry run
 * when no `DryRunContext` is supplied, so the editor gets the same rules and messages the save
 * applies. A second copy could tell the analyst something the save then contradicts.
 */
@Injectable()
export class ValidateFormulaService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly calculatedFieldValidator: CalculatedFieldValidatorService
  ) {}

  async run(command: ValidateFormulaCommand): Promise<ValidateFormulaResult> {
    // Same bar as the blendable-schema read this validation can trigger: an identity is required,
    // and it must be the CALLER's own — never a fabricated one (see JoinTreeContext).
    if (!command.userId) {
      throw new UnauthorizedException('Authenticated user is required');
    }

    const dataMart = await this.dataMartService.getByIdAndProjectId(
      command.dataMartId,
      command.projectId
    );

    // The answer describes the Data Mart's fields and joined sources, so this must not become a way
    // to probe a Data Mart the caller cannot see. EDIT rather than SEE, matching the route guard
    // and `UpdateDataMartSchemaService`: this answers "would the save I am about to make be
    // accepted", so whoever may ask is whoever may make that save.
    const canEdit = await this.accessDecisionService.canAccess(
      command.userId,
      command.roles,
      EntityType.DATA_MART,
      command.dataMartId,
      Action.EDIT,
      command.projectId
    );
    if (!canEdit) {
      throw new ForbiddenException('You do not have access to this DataMart');
    }

    const storageType = dataMart.storage.type;
    const unknownType = unknownFieldTypeViolation(command.type, storageType, command.name);
    if (unknownType) return { errors: [unknownType], warnings: [], otherFieldErrors: [] };

    // The submitted type is checked above, and the draft's siblings arrive over the same wire.
    // Collected rather than returned early: an unspellable type belongs to a row the analyst does
    // not have open, so it says what the save will refuse without withholding the answer they
    // asked for.
    const draftTypeViolations = unknownDraftFieldTypeViolations(command, storageType);

    const { errors, warnings } = await this.calculatedFieldValidator.validate(
      // The one cast in this flow, and the assumption behind it is the `FormulaProbeSchema` type
      // above: without a `DryRunContext` nothing downstream reads a schema's discriminator.
      buildProbeSchema(dataMart.schema, command) as DataMartSchema,
      storageType,
      // No DryRunContext — this is the parser pass alone. The warehouse is not asked, and no
      // `warehouseValidation` stamp comes back to be interpreted.
      undefined,
      // Passed exactly as the save passes it, with the caller's own accessor: a joined path is a
      // property of the Data Mart's relationships, not of its warehouse, so it resolves here too.
      {
        dataMartId: dataMart.id,
        projectId: command.projectId,
        accessor: { userId: command.userId, roles: command.roles },
      }
    );

    // The probe keeps every OTHER calculated field, since a formula may READ one, so this pass also
    // re-judges formulas nobody is editing. `errors`/`warnings` are about the submitted formula,
    // `otherFieldErrors` is the collateral. Other fields' WARNINGS are dropped: an advisory about a
    // formula the analyst did not open is noise, and unlike an error it costs nothing at save time.
    const isSubmitted = (violation: FormulaViolation) => violation.field === command.name;
    return {
      errors: errors.filter(isSubmitted),
      warnings: warnings.filter(isSubmitted),
      otherFieldErrors: capOtherFieldErrors([
        ...draftTypeViolations,
        ...errors.filter(violation => !isSubmitted(violation)),
      ]),
    };
  }
}

/**
 * The most collateral problems one answer carries, and the most from any single field.
 *
 * This bucket is a request for ATTENTION, not a report: the editor lists it under a formula the
 * analyst is still typing. One field can contribute one violation per broken reference, and a
 * formula may hold hundreds — 99 other fields each naming 450 missing references turns a request
 * bounded at 1 MB into an answer measured in megabytes, and `dedupeViolations` cannot collapse them
 * because the reference label is inside `message`.
 *
 * Per FIELD first, so breadth wins: which fields this edit breaks is the useful fact, and the
 * fourth broken reference in one of them is not.
 */
const OTHER_FIELD_ERRORS_PER_FIELD = 3;
const OTHER_FIELD_ERRORS_TOTAL = 50;

function capOtherFieldErrors(violations: FormulaViolation[]): FormulaViolation[] {
  const perField = new Map<string, number>();
  const kept: FormulaViolation[] = [];

  for (const violation of violations) {
    const taken = perField.get(violation.field) ?? 0;
    if (taken >= OTHER_FIELD_ERRORS_PER_FIELD) continue;
    if (kept.length >= OTHER_FIELD_ERRORS_TOTAL) break;
    perField.set(violation.field, taken + 1);
    kept.push(violation);
  }

  const omitted = violations.length - kept.length;
  if (omitted === 0) return kept;
  return [...kept, FormulaViolations.otherFieldErrorsTruncated(violations[0].field, omitted)];
}

/**
 * A field type the storage's schema does not know, reported as a VIOLATION rather than thrown.
 *
 * Not a 4xx, which is what this used to raise: a broken formula is an ANSWER here, not a failed
 * request. A non-200 leaves the diagnostics panel empty — which reads as "your formula is clean" —
 * and after three the client's brake disables the channel for the session. Reachable on Snowflake,
 * whose web type list offers 35 spellings against the backend enum's 11, including the `VARCHAR`
 * every new metric row used to be born with.
 *
 * Nothing is validated past this point: a type the storage cannot spell describes a field the save
 * could never persist.
 */
function unknownFieldTypeViolation(
  type: string,
  storageType: DataStorageType,
  field: string
): FormulaViolation | null {
  if (storageFieldTypesFor(storageType).has(type)) return null;
  return {
    code: 'FORMULA_FIELD_TYPE_NOT_SUPPORTED',
    field,
    subject: type,
    message: `\`${type}\` is not a field type this Data Mart's storage accepts.`,
  };
}

/**
 * The same check for every OTHER field the draft carries, filed under the field that owns it —
 * otherwise a schema that cannot be saved comes back from this channel clean.
 *
 * The submitted field is skipped: the probe writes `command.type` over the draft's entry of the
 * same name, so the draft's copy describes nothing that will be judged.
 */
function unknownDraftFieldTypeViolations(
  command: ValidateFormulaCommand,
  storageType: DataStorageType
): FormulaViolation[] {
  const violations: FormulaViolation[] = [];
  for (const field of command.calculatedFields ?? []) {
    if (field.name === command.name) continue;
    const violation = unknownFieldTypeViolation(field.type, storageType, field.name);
    if (violation) violations.push(violation);
  }
  return violations;
}

/**
 * The schema the SAVE would persist, with the submitted formula written into it — substituted over
 * a field of the same name, appended when the name is new. That is the point of the whole
 * function: a sibling reference has to resolve here exactly as it will there.
 *
 * The Output Schema editor is deferred-save, so "the schema the save would persist" is what the
 * EDITOR is holding: the formulas in `calculatedFields` REPLACE every persisted one rather than
 * adding to them.
 *
 * ORDINARY columns still come from the persisted schema, which is a known gap. The quiet half is
 * the worse one: nothing rewrites a `{{ref}}` tag when a column is RENAMED, so a formula naming the
 * old spelling resolves cleanly here and the save then refuses it. Closing it needs the draft's
 * whole field TREE on the wire, a wider contract left deliberately unbuilt.
 *
 * Deep-cloned because `validate` REWRITES the formulas it accepts in place. Nothing here saves, but
 * leaving a formula nobody submitted on the loaded entity is a trap for whatever reads it next.
 */
function buildProbeSchema(
  persisted: DataMartSchema | undefined,
  command: ValidateFormulaCommand
): FormulaProbeSchema {
  // `mode` (BigQuery/Snowflake) and every other storage-specific attribute are deliberately
  // absent: nothing in the parser pass reads them, and inventing one per storage type would be a
  // second definition of what a schema field is. `type` is already checked against the storage's
  // own vocabulary above, which is what makes the cast a narrowing rather than a guess.
  const probe = {
    name: command.name,
    type: command.type,
    status: DataMartSchemaFieldStatus.CONNECTED,
    // No `level`: it is derived from the formula, and the live channel is judging a formula, not
    // saving one — inventing a level here would be a value nobody asked for and nobody reads.
    calculated: { formula: command.formula },
  } as DataMartSchemaField;

  // `fields` is typed as required but lives in a JSON column, so a hand-written or half-migrated
  // row can arrive without it; treated as empty rather than thrown at. A Data Mart whose schema
  // was never actualized has no persisted fields at all, and still deserves an answer about the
  // formula's structure.
  const cloned = persisted
    ? (structuredClone(persisted) as { fields?: DataMartSchemaField[] })
    : { fields: [] };
  const fields = withDraftCalculatedFields(cloned.fields ?? [], command.calculatedFields);
  const existing = fields.findIndex(field => field.name === command.name);
  if (existing === -1) return { fields: [...fields, probe] };

  // The merge keeps the replaced field's storage-specific attributes but drops its nested
  // children: a calculated field has no columns under it, and the save cannot produce a field that
  // is both a RECORD and a formula. Carrying them over would leave `parent.child` referenceable in
  // a shape no save could ever persist.
  const { fields: _nested, ...replaced } = fields[existing] as DataMartSchemaField & {
    fields?: DataMartSchemaField[];
  };
  return {
    fields: fields.map((field, index) =>
      index === existing ? ({ ...replaced, ...probe } as DataMartSchemaField) : field
    ),
  };
}

/**
 * The persisted fields with the editor's formulas swapped in for the persisted ones.
 *
 * Every persisted CALCULATED field goes, because the draft is the whole truth about those; so does
 * any persisted field whose NAME the draft has claimed, which is what keeps one name to one field.
 * Two fields of a name would leave the substitution above merging into whichever came first and
 * the other judged beside it, reporting a stale formula's violations under the submitted name.
 *
 * Nested calculated fields are not looked for: every save path's schema parser refuses a dotted
 * calculated name, so a calculated field is always top-level.
 */
function withDraftCalculatedFields(
  persisted: readonly DataMartSchemaField[],
  draft: readonly DraftCalculatedField[] | undefined
): DataMartSchemaField[] {
  if (!draft?.length) return [...persisted];

  const claimed = new Set(draft.map(field => field.name));
  const kept = persisted.filter(field => !isCalculatedField(field) && !claimed.has(field.name));
  return [
    ...kept,
    ...draft.map(
      field =>
        ({
          name: field.name,
          type: field.type,
          status: DataMartSchemaFieldStatus.CONNECTED,
          // Fresh objects, not the request's own: `validate` canonicalizes the formulas it accepts
          // in place, and a DTO is not a scratch pad.
          calculated: { formula: field.formula },
        }) as DataMartSchemaField
    ),
  ];
}
