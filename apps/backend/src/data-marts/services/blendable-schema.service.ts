import { Injectable, Logger } from '@nestjs/common';
import {
  AvailableSourceDto,
  BlendableSchemaDto,
  BlendedFieldDto,
} from '../dto/domain/blendable-schema.dto';
import { DataMartRelationshipService } from './data-mart-relationship.service';
import { DataMartService } from './data-mart.service';
import { DataMartSchema } from '../data-storage-types/data-mart-schema.type';
import { DataMartSchemaFieldStatus } from '../data-storage-types/enums/data-mart-schema-field-status.enum';
import { isNumericFieldType } from '../data-storage-types/field-type-compatibility';
import { BlendedFieldsConfig, BlendedSource } from '../dto/schemas/blended-fields-config.schemas';
import { AggregateFunction } from '../dto/schemas/relationship-schemas';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';

const MAX_TRANSITIVE_DEPTH = 10;

const DEFAULT_CONFIG: BlendedFieldsConfig = {
  sources: [],
};

function getDefaultAggregateFunction(rawFieldType: string): AggregateFunction {
  return isNumericFieldType(rawFieldType) ? 'SUM' : 'STRING_AGG';
}

interface RawSchemaField {
  name: string;
  type: string;
  status?: string;
  alias?: string;
  description?: string;
  fields?: RawSchemaField[];
}

interface FlatSchemaField {
  name: string;
  type: string;
  alias?: string;
  description?: string;
}

export function flattenSchemaFields(fields: RawSchemaField[], prefix = ''): FlatSchemaField[] {
  const result: FlatSchemaField[] = [];
  for (const field of fields) {
    if (field.status === DataMartSchemaFieldStatus.DISCONNECTED) continue;
    const fullName = prefix ? `${prefix}.${field.name}` : field.name;
    if (field.fields && field.fields.length > 0) {
      result.push(...flattenSchemaFields(field.fields, fullName));
    } else {
      result.push({
        name: fullName,
        type: field.type,
        alias: field.alias,
        description: field.description,
      });
    }
  }
  return result;
}

interface CollectContext {
  sourceId: string;
  parentPath: string;
  sourcesByPath: Map<string, BlendedSource>;
  result: BlendedFieldDto[];
  availableSources: AvailableSourceDto[];
  visited: Set<string>;
  depth: number;
}

@Injectable()
export class BlendableSchemaService {
  private readonly logger = new Logger(BlendableSchemaService.name);

  constructor(
    private readonly relationshipService: DataMartRelationshipService,
    private readonly dataMartService: DataMartService
  ) {}

  async computeBlendableSchema(dataMartId: string, projectId: string): Promise<BlendableSchemaDto> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(dataMartId, projectId);
    const nativeFields = (dataMart.schema?.fields ?? []).filter(
      f => !f.isHiddenForReporting
    ) as DataMartSchema['fields'];

    const config: BlendedFieldsConfig = dataMart.blendedFieldsConfig ?? DEFAULT_CONFIG;
    const sourcesByPath = new Map(config.sources.map(s => [s.path, s]));

    const blendedFields: BlendedFieldDto[] = [];
    const availableSources: AvailableSourceDto[] = [];
    const visited = new Set<string>();

    await this.collectBlendedFields({
      sourceId: dataMartId,
      parentPath: '',
      sourcesByPath,
      result: blendedFields,
      availableSources,
      visited,
      depth: 1,
    });

    return {
      nativeFields,
      nativeDescription: dataMart.description ?? undefined,
      blendedFields,
      availableSources,
    };
  }

  private async collectBlendedFields(ctx: CollectContext): Promise<void> {
    if (ctx.depth > MAX_TRANSITIVE_DEPTH) {
      this.logger.warn(
        `Blendable schema traversal hit MAX_TRANSITIVE_DEPTH=${MAX_TRANSITIVE_DEPTH} ` +
          `at path "${ctx.parentPath}". Deeper relationships are silently truncated — ` +
          `restructure the relationship graph or raise the limit.`
      );
      return;
    }

    const relationships = await this.relationshipService.findBySourceDataMartId(ctx.sourceId);

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

      const currentPath = ctx.parentPath ? `${ctx.parentPath}.${rel.targetAlias}` : rel.targetAlias;

      if (ctx.visited.has(currentPath)) continue;
      ctx.visited.add(currentPath);

      const sourceConfig = ctx.sourcesByPath.get(currentPath);
      const isExcluded = sourceConfig?.isExcluded === true;

      const targetSchemaFields = (rel.targetDataMart.schema?.fields ?? []).filter(
        f => !f.isHiddenForReporting
      );
      const flatTargetFields = flattenSchemaFields(targetSchemaFields);

      // `sqlPrefix` is SQL‑safe because each `targetAlias` segment in
      // `currentPath` is validated against `^[a-z0-9_]+$` in the Join
      // Settings form. `displayPrefix` is free‑form and must never flow
      // into SQL identifiers.
      const sqlPrefix = currentPath.replace(/\./g, '_');
      const displayPrefix = sourceConfig?.alias ?? rel.targetDataMart.title;

      // Always collect available source metadata
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
      ctx.availableSources.push(availableSource);

      for (const field of flatTargetFields) {
        const fieldOverride = sourceConfig?.fields?.[field.name];

        const dto = new BlendedFieldDto();
        // Replace dots in nested struct field paths (e.g. `struct.field`) with
        // underscores so the resulting alias is a valid SQL identifier.
        dto.name = `${sqlPrefix}__${field.name.replace(/\./g, '_')}`;
        dto.aliasPath = currentPath;
        dto.outputPrefix = displayPrefix;
        dto.sourceRelationshipId = rel.id;
        dto.sourceDataMartId = rel.targetDataMart.id;
        dto.sourceDataMartTitle = rel.targetDataMart.title;
        dto.targetAlias = rel.targetAlias;
        dto.originalFieldName = field.name;
        dto.type = field.type;
        dto.alias = fieldOverride?.alias ?? field.alias ?? '';
        dto.description = field.description ?? '';
        dto.isHidden = fieldOverride?.isHidden ?? false;
        dto.aggregateFunction =
          fieldOverride?.aggregateFunction ?? getDefaultAggregateFunction(field.type);
        dto.transitiveDepth = ctx.depth;

        ctx.result.push(dto);
      }

      await this.collectBlendedFields({
        ...ctx,
        sourceId: rel.targetDataMart.id,
        parentPath: currentPath,
        depth: ctx.depth + 1,
      });
    }
  }
}
