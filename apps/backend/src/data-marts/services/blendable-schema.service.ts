import { Injectable } from '@nestjs/common';
import { BlendableSchemaDto, BlendedFieldDto } from '../dto/domain/blendable-schema.dto';
import { DataMartRelationshipService } from './data-mart-relationship.service';
import { DataMartService } from './data-mart.service';
import { DataMartSchema } from '../data-storage-types/data-mart-schema.type';

const MAX_TRANSITIVE_DEPTH = 10;

interface RawSchemaField {
  name: string;
  type: string;
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

function flattenSchemaFields(fields: RawSchemaField[], prefix = ''): FlatSchemaField[] {
  const result: FlatSchemaField[] = [];
  for (const field of fields) {
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

    const blendedFields: BlendedFieldDto[] = [];
    const visited = new Set<string>([dataMartId]);

    await this.collectBlendedFields(dataMartId, blendedFields, visited, 1);

    return { nativeFields, blendedFields };
  }

  private async collectBlendedFields(
    sourceDataMartId: string,
    result: BlendedFieldDto[],
    visited: Set<string>,
    depth: number
  ): Promise<void> {
    if (depth > MAX_TRANSITIVE_DEPTH) {
      return;
    }

    const relationships = await this.relationshipService.findBySourceDataMartId(sourceDataMartId);

    for (const rel of relationships) {
      const targetDataMartId = rel.targetDataMart.id;

      const targetSchemaFields = (rel.targetDataMart.schema?.fields ?? []).filter(
        f => !f.isHiddenForReporting
      );
      const flatTargetFields = flattenSchemaFields(targetSchemaFields);

      for (const blendedFieldConfig of rel.blendedFields) {
        const schemaField = flatTargetFields.find(
          f => f.name === blendedFieldConfig.targetFieldName
        );

        const dto = new BlendedFieldDto();
        dto.name = blendedFieldConfig.outputAlias;
        dto.sourceRelationshipId = rel.id;
        dto.sourceDataMartId = targetDataMartId;
        dto.sourceDataMartTitle = rel.targetDataMart.title;
        dto.targetAlias = rel.targetAlias;
        dto.originalFieldName = blendedFieldConfig.targetFieldName;
        dto.type = schemaField?.type ?? 'UNKNOWN';
        dto.alias = schemaField?.alias ?? '';
        dto.description = schemaField?.description ?? '';
        dto.isHidden = blendedFieldConfig.isHidden;
        dto.aggregateFunction = blendedFieldConfig.aggregateFunction;
        dto.transitiveDepth = depth;

        result.push(dto);
      }

      if (!visited.has(targetDataMartId)) {
        visited.add(targetDataMartId);
        await this.collectBlendedFields(targetDataMartId, result, visited, depth + 1);
      }
    }
  }
}
