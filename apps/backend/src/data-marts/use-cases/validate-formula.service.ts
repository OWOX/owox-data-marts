import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { CalculatedFieldValidatorService } from '../calculated-fields/calculated-field-validator.service';
import { isCalculatedField } from '../calculated-fields/calculated-field.utils';
import { FormulaViolation } from '../calculated-fields/formula-violations';
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
   * What ELSE would refuse the save, filed under the field that owns it. Attribution follows the
   * OWNING formula, not the causing one: converting a column into a metric makes every other
   * formula that references that column illegal, and each of those violations belongs to its own
   * field. Without this bucket the editor would look green right up to a failing save — the
   * live-versus-save disagreement this whole design exists to prevent.
   *
   * It carries NO baseline, so it cannot distinguish a metric this edit broke from one that was
   * already broken before the analyst opened anything: establishing that would mean validating the
   * persisted schema on every keystroke as well, doubling a cost that is already the heaviest part
   * of this endpoint. A client may therefore say the save will fail and name the field, and may not
   * say this edit is the reason.
   */
  otherFieldErrors: FormulaViolation[];
}

/**
 * What the parser pass actually reads out of a `DataMartSchema`: its fields, and nothing else. The
 * storage type travels as `validate`'s own second argument, and the discriminator is never touched
 * because the warehouse phase (the only part that composes SQL) is skipped here. Naming that as a
 * type rather than a comment is what lets `buildProbeSchema` be honest for a Data Mart whose schema
 * was never actualized, where there is no truthful discriminator to invent.
 */
type FormulaProbeSchema = { fields: DataMartSchemaField[] };

/**
 * The formula editor's live channel: what is wrong with ONE formula, answered without asking the
 * warehouse.
 *
 * It is deliberately not a second validator. `CalculatedFieldValidatorService.validate` already
 * skips the dry run when no `DryRunContext` is supplied, so calling it that way gives the editor
 * the same rules, the same messages and the same joined-path resolution the save applies — which
 * is the whole point: a second copy could tell the analyst something the save then contradicts.
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

    // The answer describes the Data Mart's fields and its joined sources, so this endpoint must
    // not become a way to probe a Data Mart the caller cannot see.
    //
    // EDIT, matching the route guard and `UpdateDataMartSchemaService` — this endpoint exists to
    // answer "would the save I am about to make be accepted", so whoever can ask it is whoever can
    // make that save. A weaker check here would leave the guard as the only real gate, with the
    // published contract describing a third, weaker one again.
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

    // The probe schema keeps every OTHER calculated field — since #6732 a formula may READ one, so
    // dropping them would report a legal reference as a missing column — and so this pass also
    // re-judges formulas nobody is editing. Splitting the result by attribution
    // is what keeps the editor's own row honest without losing what the save would refuse:
    // `errors`/`warnings` are about the submitted formula, `otherFieldErrors` is the collateral.
    //
    // Other fields' WARNINGS are dropped rather than bucketed: an advisory about a formula the
    // analyst did not open is noise, and unlike an error it costs nothing at save time.
    const isSubmitted = (violation: FormulaViolation) => violation.field === command.name;
    return {
      errors: errors.filter(isSubmitted),
      warnings: warnings.filter(isSubmitted),
      otherFieldErrors: [
        ...draftTypeViolations,
        ...errors.filter(violation => !isSubmitted(violation)),
      ],
    };
  }
}

/**
 * A field type the storage's own schema does not know, reported as a VIOLATION rather than thrown
 * — the same vocabulary the save refuses it with, read from the same enums the storages' zod
 * schemas wrap. Left unchecked, `{ type: "BANANA" }` came back clean from the live channel and then
 * failed the save, which is the disagreement this endpoint exists to remove.
 *
 * Why not a 4xx, which is what this used to raise. The channel's contract is that a broken formula
 * is an ANSWER, not a failed request, and the client acts on that: a non-200 leaves the diagnostics
 * panel empty — which reads as "your formula is clean" — and after three of them the client's brake
 * disables the channel for the rest of the session. That made this the loudest possible bug in the
 * quietest possible way on Snowflake, whose web type list offers 35 spellings (`VARCHAR`, `NUMBER`,
 * `BIGINT`, …) against the 11 the backend enum holds — including the `VARCHAR` every new Snowflake
 * metric row is born with. An empty panel must never be how someone learns the check is broken.
 *
 * Nothing is validated past this point: a type the storage cannot spell describes a field the save
 * could never persist, so the parser pass would be answering a question about a schema that cannot
 * exist.
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
 * The same check as above, for every OTHER field the draft carries — filed under the field that
 * owns it, which is what `otherFieldErrors` is for: a type the storage cannot spell describes a
 * field the save would refuse, so leaving it unchecked let a schema that cannot be saved come back
 * from this channel clean.
 *
 * The submitted field is skipped: its type is `command.type`, checked on its own terms, and the
 * probe writes it over the draft's entry of the same name — so the draft's copy describes nothing
 * that will be judged.
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
 * Which is why the persisted schema is only half of it. The Output Schema editor is deferred-save,
 * so "the schema the save would persist" is what the EDITOR is holding, and `calculatedFields`
 * carries that: the formulas it holds REPLACE every persisted one rather than adding to them, so a
 * sibling added in this session resolves and one deleted in this session stops being judged.
 *
 * ORDINARY columns still come from the persisted schema, and that is a known gap, not a property of
 * the editor: the same editor adds, renames and deletes them (`BaseSchemaTable`'s name cell and
 * `handleDeleteRow`). It has two halves, and the quiet one is worse:
 *
 * - LOUD — a formula naming a column deleted in this session still comes back as "no longer exists
 *   in the Data Mart", the same false accusation this parameter removes for formulas;
 * - QUIET — nothing rewrites a `{{ref}}` tag when a column is RENAMED, so an existing formula still
 *   naming the old spelling resolves cleanly here against the persisted probe, and the save then
 *   refuses it. That is the live-versus-save disagreement this endpoint exists to prevent, arriving
 *   from the side where nobody is warned.
 *
 * Closing it needs the draft's whole field TREE on the wire (nested records included, or every
 * `payload.child` reference becomes the false accusation instead), which is a wider contract than
 * this one and is left deliberately unbuilt.
 *
 * A caller that reports no draft at all falls back to the persisted formulas — see the command's
 * own note on why empty and absent must mean the same thing.
 *
 * Deep-cloned because `validate` REWRITES the formulas it accepts in place (canonical spelling).
 * Nothing here saves, and a `findOne` result is not change-tracked, so an un-cloned probe would
 * corrupt only the entity loaded for THIS request — but leaving a formula nobody submitted on it
 * is a trap for whatever reads that entity next.
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
