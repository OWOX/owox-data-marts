import { Injectable } from '@nestjs/common';
import { BlendableSchemaDto, BlendedFieldDto } from '../dto/domain/blendable-schema.dto';
import { DataMartRelationshipService } from './data-mart-relationship.service';
import { DataMartService } from './data-mart.service';
import { DataMartSchema } from '../data-storage-types/data-mart-schema.type';

const MAX_TRANSITIVE_DEPTH = 10;

interface RawSchemaField {
  name: string;
  type: string;
  fields?: RawSchemaField[];
}

function flattenSchemaFields(
  fields: RawSchemaField[],
  prefix = ''
): { name: string; type: string }[] {
  const result: { name: string; type: string }[] = [];
  for (const field of fields) {
    const fullName = prefix ? `${prefix}.${field.name}` : field.name;
    result.push({ name: fullName, type: field.type });
    if (field.fields && Array.isArray(field.fields)) {
      result.push(...flattenSchemaFields(field.fields, fullName));
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
    const nativeFields = dataMart.schema?.fields ?? [];

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

      if (visited.has(targetDataMartId)) {
        continue;
      }

      visited.add(targetDataMartId);

      const targetSchemaFields: DataMartSchema['fields'] = rel.targetDataMart.schema?.fields ?? [];
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
        dto.isHidden = blendedFieldConfig.isHidden;
        dto.aggregateFunction = blendedFieldConfig.aggregateFunction;
        dto.transitiveDepth = depth;

        result.push(dto);
      }

      await this.collectBlendedFields(targetDataMartId, result, visited, depth + 1);
    }
  }
}
