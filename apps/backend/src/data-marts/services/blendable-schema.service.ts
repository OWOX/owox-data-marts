import { Injectable } from '@nestjs/common';
import {
  AvailableSourceDto,
  BlendableSchemaDto,
  BlendedFieldDto,
} from '../dto/domain/blendable-schema.dto';
import { DataMartRelationshipService } from './data-mart-relationship.service';
import { DataMartService } from './data-mart.service';
import { DataMartSchema } from '../data-storage-types/data-mart-schema.type';
import { DataMartSchemaFieldStatus } from '../data-storage-types/enums/data-mart-schema-field-status.enum';
import { BlendedFieldsConfig, BlendedSource } from '../dto/schemas/blended-fields-config.schemas';

const MAX_TRANSITIVE_DEPTH = 10;

const DEFAULT_CONFIG: BlendedFieldsConfig = {
  blendingBehaviour: 'AUTO_BLEND_ALL',
  sources: [],
};

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
  config: BlendedFieldsConfig;
  sourcesByPath: Map<string, BlendedSource>;
  result: BlendedFieldDto[];
  availableSources: AvailableSourceDto[];
  visited: Set<string>;
  depth: number;
}

@Injectable()
export class BlendableSchemaService {
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
      config,
      sourcesByPath,
      result: blendedFields,
      availableSources,
      visited,
      depth: 1,
    });

    return { nativeFields, blendedFields, availableSources };
  }

  private async collectBlendedFields(ctx: CollectContext): Promise<void> {
    if (ctx.depth > MAX_TRANSITIVE_DEPTH) {
      return;
    }

    const relationships = await this.relationshipService.findBySourceDataMartId(ctx.sourceId);

    for (const rel of relationships) {
      const currentPath = ctx.parentPath ? `${ctx.parentPath}.${rel.targetAlias}` : rel.targetAlias;

      if (ctx.visited.has(currentPath)) continue;
      ctx.visited.add(currentPath);

      const sourceConfig = ctx.sourcesByPath.get(currentPath);
      const isExcluded = sourceConfig?.isExcluded === true;
      const shouldInclude =
        !isExcluded &&
        this.shouldIncludeSource(ctx.config.blendingBehaviour, ctx.depth, sourceConfig);

      const targetSchemaFields = (rel.targetDataMart.schema?.fields ?? []).filter(
        f => !f.isHiddenForReporting
      );
      const flatTargetFields = flattenSchemaFields(targetSchemaFields);

      // Always collect available source metadata
      const availableSource = new AvailableSourceDto();
      availableSource.aliasPath = currentPath;
      availableSource.title = rel.targetDataMart.title;
      availableSource.defaultAlias = sourceConfig?.alias ?? currentPath.replace(/\./g, '_');
      availableSource.depth = ctx.depth;
      availableSource.fieldCount = flatTargetFields.length;
      availableSource.isIncluded = shouldInclude;
      availableSource.relationshipId = rel.id;
      availableSource.dataMartId = rel.targetDataMart.id;
      ctx.availableSources.push(availableSource);

      // Always collect fields for all sources (needed for UI dialogs)
      const outputPrefix = sourceConfig?.alias ?? currentPath.replace(/\./g, '_');

      for (const field of flatTargetFields) {
        const fieldOverride = sourceConfig?.fields?.[field.name];

        const dto = new BlendedFieldDto();
        dto.name = `${outputPrefix} ${field.name}`;
        dto.aliasPath = currentPath;
        dto.outputPrefix = outputPrefix;
        dto.sourceRelationshipId = rel.id;
        dto.sourceDataMartId = rel.targetDataMart.id;
        dto.sourceDataMartTitle = rel.targetDataMart.title;
        dto.targetAlias = rel.targetAlias;
        dto.originalFieldName = field.name;
        dto.type = field.type;
        dto.alias = field.alias ?? '';
        dto.description = field.description ?? '';
        dto.isHidden = fieldOverride?.isHidden ?? false;
        dto.aggregateFunction = fieldOverride?.aggregateFunction ?? 'STRING_AGG';
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

  private shouldIncludeSource(
    behaviour: BlendedFieldsConfig['blendingBehaviour'],
    depth: number,
    sourceConfig: BlendedSource | undefined
  ): boolean {
    switch (behaviour) {
      case 'AUTO_BLEND_ALL':
        return true;
      case 'BLEND_DIRECT_ONLY':
        return depth === 1 || sourceConfig !== undefined;
      case 'MANUAL':
        return sourceConfig !== undefined;
    }
  }
}
