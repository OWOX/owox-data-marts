import { Injectable } from '@nestjs/common';
import { BlendableSchemaDto, BlendedFieldDto } from '../dto/domain/blendable-schema.dto';
import { DataMartRelationshipService } from './data-mart-relationship.service';
import { DataMartService } from './data-mart.service';
import { DataMartSchema } from '../data-storage-types/data-mart-schema.type';

const MAX_TRANSITIVE_DEPTH = 10;

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

      for (const blendedFieldConfig of rel.blendedFields) {
        const schemaField = targetSchemaFields.find(
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
