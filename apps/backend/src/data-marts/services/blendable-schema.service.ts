import { Injectable } from '@nestjs/common';
import {
  AvailableSourceDto,
  BlendableSchemaDto,
  BlendedFieldDto,
  CalculatedFieldIssueDto,
} from '../dto/domain/blendable-schema.dto';
import { DataMartRelationshipService } from './data-mart-relationship.service';
import { DataMartService } from './data-mart.service';
import { AccessDecisionService, Action, EntityType } from './access-decision';
import { DataMartSchema } from '../data-storage-types/data-mart-schema.type';
import { DataMartSchemaFieldStatus } from '../data-storage-types/enums/data-mart-schema-field-status.enum';
import {
  brokenJoinedReferencesOf,
  brokenReferencesOf,
  buildJoinedReferenceIndex,
  calculatedFieldsOf,
  type CalculatedFieldConfig,
} from '../calculated-fields/calculated-field.utils';
import {
  classifyJoinedUniqueCountAvailability,
  collectPrimaryKeyRowIdentity,
  getMainUniqueCountKeyFields,
} from '../data-storage-types/data-mart-schema.utils';
import {
  isDateOrTimeFieldType,
  isNumericFieldType,
} from '../data-storage-types/field-type-compatibility';
import { BlendedFieldsConfig, BlendedSource } from '../dto/schemas/blended-fields-config.schema';
import { AggregateFunction } from '../dto/schemas/aggregate-function.schema';
import { resolveFieldGovernance } from '../dto/schemas/field-aggregation-governance';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import { buildBlendedFieldUnifiedName } from './blended-field-name';
import { computeEffectiveType } from '../data-storage-types/field-aggregation';
import { StorageFieldType } from '../dto/domain/storage-field-type';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';

export interface BlendableSchemaAccessor {
  userId: string;
  roles: string[];
}

export async function resolveBlendableSchemaAccessor(
  idpProjectionsFacade: IdpProjectionsFacade,
  projectId: string,
  userId: string
): Promise<BlendableSchemaAccessor> {
  const member = await idpProjectionsFacade.getProjectMemberOrThrow(projectId, userId);
  if (!member) {
    throw new BusinessViolationException(
      `User is no longer a member of this project; report cannot run on their behalf.`,
      { userId, projectId }
    );
  }
  return { userId, roles: [member.role] };
}

const DEFAULT_CONFIG: BlendedFieldsConfig = {
  sources: [],
};

function getDefaultAggregateFunction(rawFieldType: string): AggregateFunction {
  if (isNumericFieldType(rawFieldType)) return 'SUM';
  if (isDateOrTimeFieldType(rawFieldType)) return 'MAX';
  return 'STRING_AGG';
}

interface RawSchemaField {
  name: string;
  type: string;
  status?: string;
  alias?: string;
  description?: string;
  fields?: RawSchemaField[];
  calculated?: CalculatedFieldConfig;
}

interface FlatSchemaField {
  name: string;
  type: string;
  alias?: string;
  description?: string;
  /** A formula, not a warehouse column — see `BlendedFieldDto.isCalculated` for who reads this. */
  isCalculated?: boolean;
}

export function flattenSchemaFields(fields: RawSchemaField[], prefix = ''): FlatSchemaField[] {
  const result: FlatSchemaField[] = [];
  for (const field of fields) {
    // A calculated field carries a warehouse-derived status that means nothing for it; skipping it
    // here would hide it from HTTP Data's ad-hoc column sets and the MCP facade.
    if (!field.calculated && field.status === DataMartSchemaFieldStatus.DISCONNECTED) continue;
    const fullName = prefix ? `${prefix}.${field.name}` : field.name;
    if (field.fields && field.fields.length > 0) {
      result.push(...flattenSchemaFields(field.fields, fullName));
    } else {
      result.push({
        name: fullName,
        type: field.type,
        alias: field.alias,
        description: field.description,
        isCalculated: field.calculated !== undefined,
      });
    }
  }
  return result;
}

interface CollectContext {
  sourceId: string;
  parentPath: string;
  sourcesByPath: Map<string, BlendedSource>;
  relationshipsBySource: Map<string, DataMartRelationship[]>;
  result: BlendedFieldDto[];
  availableSources: AvailableSourceDto[];
  branchDmIds: Set<string>;
  depth: number;
  storageType: DataStorageType;
}

@Injectable()
export class BlendableSchemaService {
  constructor(
    private readonly relationshipService: DataMartRelationshipService,
    private readonly dataMartService: DataMartService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async computeBlendableSchema(
    dataMartId: string,
    projectId: string,
    accessor: BlendableSchemaAccessor
  ): Promise<BlendableSchemaDto> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(dataMartId, projectId);
    const nativeFields = (dataMart.schema?.fields ?? []).filter(
      f => !f.isHiddenForReporting
    ) as DataMartSchema['fields'];

    const config: BlendedFieldsConfig = dataMart.blendedFieldsConfig ?? DEFAULT_CONFIG;
    const sourcesByPath = new Map(config.sources.map(s => [s.path, s]));

    const allStorageRelationships = await this.relationshipService.findByStorageId(
      dataMart.storage.id,
      projectId
    );
    const relationshipsBySource = new Map<string, DataMartRelationship[]>();
    for (const rel of allStorageRelationships) {
      const list = relationshipsBySource.get(rel.sourceDataMart.id);
      if (list) list.push(rel);
      else relationshipsBySource.set(rel.sourceDataMart.id, [rel]);
    }

    const blendedFields: BlendedFieldDto[] = [];
    const availableSources: AvailableSourceDto[] = [];
    const branchDmIds = new Set<string>([dataMartId]);

    this.collectBlendedFields({
      sourceId: dataMartId,
      parentPath: '',
      sourcesByPath,
      relationshipsBySource,
      result: blendedFields,
      availableSources,
      branchDmIds,
      depth: 1,
      storageType: dataMart.storage.type,
    });

    await this.applyReportingAccess(availableSources, projectId, accessor);

    const rawSchemaFields = dataMart.schema?.fields ?? [];
    // The join tree this very call just walked — so a formula's joined reference is checked against
    // the SAME tree the report builder will route it through, on the one payload the picker reads.
    const joinedReferenceIndex = buildJoinedReferenceIndex({ availableSources, blendedFields });

    return {
      nativeFields,
      nativeDescription: dataMart.description ?? undefined,
      blendedFields,
      availableSources,
      // From the RAW schema, not `nativeFields`: a key column hidden for reporting is stripped from
      // that list but is still counted, so deriving it there reports "no key" for a key that works.
      mainUniqueCountKeyFields: getMainUniqueCountKeyFields(rawSchemaFields).map(f => f.name),
      // Same reason, same RAW input: `brokenReferencesOf` deliberately keeps a hidden field as a
      // valid formula target (hidden takes a column off the reporting menu, it does not
      // remove it from the source), so resolving against `nativeFields` would misreport every
      // metric that references one as broken. Mirrors `output-controls-validator.service.ts`'s own
      // composition-time check exactly (same function, same input shape); only entries that
      // actually have a missing reference are included.
      // A joined reference goes stale the same ways an own one does — the join deleted, its alias
      // renamed out from under the formula, the field gone or hidden — and it fails the same way:
      // nothing resolves the path, so the metric renders `main.<field>`. Both halves ride one
      // channel because the picker asks one question ("is this metric usable?").
      calculatedFieldIssues: calculatedFieldsOf(rawSchemaFields).reduce<CalculatedFieldIssueDto[]>(
        (issues, field) => {
          const missing = [
            ...brokenReferencesOf(field, rawSchemaFields),
            ...brokenJoinedReferencesOf(field, joinedReferenceIndex),
          ];
          if (missing.length > 0) issues.push({ field: field.name, missing });
          return issues;
        },
        []
      ),
    };
  }

  private async applyReportingAccess(
    availableSources: AvailableSourceDto[],
    projectId: string,
    accessor: BlendableSchemaAccessor
  ): Promise<void> {
    if (availableSources.length === 0) return;

    const targetDataMartIds = Array.from(new Set(availableSources.map(s => s.dataMartId)));
    const directAccess = await this.accessDecisionService.canAccessMany(
      accessor.userId,
      accessor.roles,
      EntityType.DATA_MART,
      targetDataMartIds,
      Action.USE,
      projectId
    );

    const accessibleByAliasPath = new Map<string, boolean>();
    const sortedByDepth = [...availableSources].sort((a, b) => a.depth - b.depth);
    for (const source of sortedByDepth) {
      const lastDot = source.aliasPath.lastIndexOf('.');
      const parentPath = lastDot === -1 ? '' : source.aliasPath.slice(0, lastDot);
      const parentAccessible =
        parentPath === '' ? true : (accessibleByAliasPath.get(parentPath) ?? false);
      const directOk = directAccess.get(source.dataMartId) ?? false;
      accessibleByAliasPath.set(source.aliasPath, parentAccessible && directOk);
    }
    for (const source of availableSources) {
      source.isAccessibleForReporting = accessibleByAliasPath.get(source.aliasPath) ?? false;
    }
  }

  private collectBlendedFields(ctx: CollectContext): void {
    const relationships = ctx.relationshipsBySource.get(ctx.sourceId) ?? [];

    for (const rel of relationships) {
      // Skip relationships that don't have join conditions configured yet. They — and any
      // relationships they transitively expose — must not surface in the reporting column
      // picker, since without a JOIN there is no valid SQL to produce their rows.
      if (!rel.joinConditions || rel.joinConditions.length === 0) continue;

      // TypeORM eager join silently drops soft-deleted DMs, leaving targetDataMart undefined.
      // Surface this as a clear, actionable error so report-run failures point to the broken
      // relationship rather than collapsing into a generic "cannot read 'schema' of undefined".
      if (!rel.targetDataMart) {
        throw new BusinessViolationException(
          `Relationship "${rel.targetAlias ?? rel.id}" (id=${rel.id}) targets a data mart that has been deleted. ` +
            `Remove this relationship or restore the target data mart before running reports that depend on it.`,
          { relationshipId: rel.id, targetAlias: rel.targetAlias }
        );
      }

      // Reports cannot join against an unfinalized schema, so a draft target — and any
      // descendants reachable only through it — must not surface in the picker.
      if (rel.targetDataMart.status !== DataMartStatus.PUBLISHED) continue;

      if (ctx.branchDmIds.has(rel.targetDataMart.id)) continue;

      const currentPath = ctx.parentPath ? `${ctx.parentPath}.${rel.targetAlias}` : rel.targetAlias;

      const sourceConfig = ctx.sourcesByPath.get(currentPath);
      const isExcluded = sourceConfig?.isExcluded === true;

      const targetSchemaFields = (rel.targetDataMart.schema?.fields ?? []).filter(
        f => !f.isHiddenForReporting
      );
      const flatTargetFields = flattenSchemaFields(targetSchemaFields);

      // Each `targetAlias` segment in `currentPath` is validated against
      // `^[a-z0-9_]+$` in the Join Settings form, so the SQL-safe prefix
      // derived inside `buildBlendedFieldUnifiedName` is safe. `displayPrefix`
      // is free-form and must never flow into SQL identifiers.
      const displayPrefix = sourceConfig?.alias ?? rel.targetDataMart.title;

      const availableSource = new AvailableSourceDto();
      availableSource.aliasPath = currentPath;
      availableSource.title = rel.targetDataMart.title;
      availableSource.description = rel.targetDataMart.description ?? undefined;
      availableSource.defaultAlias = displayPrefix;
      availableSource.depth = ctx.depth;
      availableSource.fieldCount = flatTargetFields.length;
      availableSource.isIncluded = !isExcluded;
      availableSource.relationshipId = rel.id;
      availableSource.dataMartId = rel.targetDataMart.id;
      // RAW schema, not targetSchemaFields: a hidden PK component still counts as a usable key.
      availableSource.uniqueCountAvailability = classifyJoinedUniqueCountAvailability(
        rel.targetDataMart.schema?.fields ?? []
      );
      // The same predicate the classifier and the sleeve read, so what the picker NAMES as the
      // counted key can never disagree with what the query counts by.
      availableSource.uniqueCountKeyFields = collectPrimaryKeyRowIdentity(
        rel.targetDataMart.schema?.fields ?? []
      );
      ctx.availableSources.push(availableSource);

      for (const field of flatTargetFields) {
        const fieldOverride = sourceConfig?.fields?.[field.name];

        const dto = new BlendedFieldDto();
        dto.name = buildBlendedFieldUnifiedName(currentPath, field.name);
        dto.aliasPath = currentPath;
        dto.outputPrefix = displayPrefix;
        dto.sourceRelationshipId = rel.id;
        dto.sourceDataMartId = rel.targetDataMart.id;
        dto.sourceDataMartTitle = rel.targetDataMart.title;
        dto.targetAlias = rel.targetAlias;
        dto.originalFieldName = field.name;
        const dedupFunction =
          fieldOverride?.aggregateFunction ?? getDefaultAggregateFunction(field.type);
        // A joined field's value in the blended result is its DEDUP (pre-join) output, so its
        // effective type — and thus which report-level aggregations are legal/offered — follows
        // the dedup function, not the raw source type. E.g. COUNT_DISTINCT on a STRING
        // hitId yields a per-key INTEGER count → SUM/AVG/MIN/MAX become available (SUM default).
        // For the default dedups the effective type is type-PRESERVING for numeric (→SUM) and
        // date (→MAX), so it equals the raw type; but `other` (→STRING_AGG) intentionally
        // recategorizes to string, since the STRING_AGG output genuinely IS a string.
        const effectiveType = computeEffectiveType(
          field.type as StorageFieldType,
          dedupFunction,
          ctx.storageType
        );
        // Carry the RAW type BEFORE overwriting `type` with the effective type, so the web can
        // recompute effective types for type-preserving dedups off the true base.
        dto.sourceFieldType = field.type;
        dto.type = effectiveType;
        dto.alias = fieldOverride?.alias ?? field.alias ?? '';
        dto.description = field.description ?? '';
        dto.isHidden = fieldOverride?.isHidden ?? false;
        dto.isCalculated = field.isCalculated === true;
        dto.aggregateFunction = dedupFunction;
        // No override → effective-type governance default; explicit `[]` = none allowed. An
        // explicit override may only NARROW the effective type's SUPPORTED set: it used to be
        // carried verbatim, so a stored config could offer a function the type cannot run. The
        // validator's type floor catches the obvious ones (SUM/AVG on a non-number,
        // COUNT_DISTINCT/STRING_AGG on a non-scalar) but NOT percentiles — `P50` on a text field
        // passed save-time validation and only failed at the warehouse. Clamping here fixes it
        // for every consumer at once: this menu feeds the validator, the MCP field list and the
        // web column picker.
        dto.postJoinAggregations = resolveFieldGovernance(effectiveType, {
          allowedAggregations: fieldOverride?.postJoinAggregations,
        }).allowedAggregations;
        dto.transitiveDepth = ctx.depth;

        ctx.result.push(dto);
      }

      this.collectBlendedFields({
        ...ctx,
        sourceId: rel.targetDataMart.id,
        parentPath: currentPath,
        branchDmIds: new Set([...ctx.branchDmIds, rel.targetDataMart.id]),
        depth: ctx.depth + 1,
      });
    }
  }
}
