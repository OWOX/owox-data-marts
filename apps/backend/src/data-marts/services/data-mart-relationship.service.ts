import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { CreateRelationshipCommand } from '../dto/domain/create-relationship.command';
import { UpdateRelationshipCommand } from '../dto/domain/update-relationship.command';
import {
  areTypesCompatible,
  isPrimitiveFieldType,
} from '../data-storage-types/field-type-compatibility';
import { DataMartSchema } from '../data-storage-types/data-mart-schema.type';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import { JoinCondition } from '../dto/schemas/join-condition.schema';
import { RelationshipMapper } from '../mappers/relationship.mapper';
import { DataMartRelationshipGraphEdgeDto } from '../dto/domain/data-mart-relationship-graph-edge.dto';
import { DataMartRelationshipRepository } from '../repositories/data-mart-relationship.repository';

@Injectable()
export class DataMartRelationshipService {
  constructor(
    @InjectRepository(DataMartRelationship)
    private readonly repository: Repository<DataMartRelationship>,
    private readonly relationshipRepository: DataMartRelationshipRepository,
    private readonly mapper: RelationshipMapper
  ) {}

  async create(
    command: CreateRelationshipCommand,
    sourceDataMart: DataMart,
    targetDataMart: DataMart
  ): Promise<DataMartRelationship> {
    const relationship = this.repository.create({
      sourceDataMart,
      targetDataMart,
      dataStorage: sourceDataMart.storage,
      targetAlias: command.targetAlias,
      joinConditions: command.joinConditions,
      projectId: command.projectId,
      createdById: command.userId,
    });

    return this.repository.save(relationship);
  }

  // Relations are loaded via `eager: true` on the entity; passing `relations: [...]`
  // here would add a second set of joins.
  async findBySourceDataMartId(sourceDataMartId: string): Promise<DataMartRelationship[]> {
    return this.repository.find({
      where: { sourceDataMart: { id: sourceDataMartId } },
      order: { createdAt: 'ASC' },
    });
  }

  async findGraphEdgesByProjectIdAndSourceDataMartIds(
    projectId: string,
    sourceDataMartIds: string[]
  ): Promise<DataMartRelationshipGraphEdgeDto[]> {
    if (sourceDataMartIds.length === 0) return [];

    const rows = await this.relationshipRepository.listGraphEdgeRowsByProjectIdAndSourceDataMartIds(
      projectId,
      sourceDataMartIds
    );

    return rows.map(row => this.mapper.toGraphEdgeDto(row));
  }

  async findSourceDataMartIdsByTargetDataMartId(
    targetDataMartId: string,
    projectId: string
  ): Promise<string[]> {
    const rows: { sourceDataMartId: string }[] = await this.repository
      .createQueryBuilder('relationship')
      .select('source.id', 'sourceDataMartId')
      .innerJoin('relationship.sourceDataMart', 'source')
      .innerJoin('relationship.targetDataMart', 'target')
      .where('target.id = :targetDataMartId', { targetDataMartId })
      .andWhere('relationship.projectId = :projectId', { projectId })
      .getRawMany();

    return [...new Set(rows.map(row => row.sourceDataMartId))];
  }

  async findByStorageId(storageId: string, projectId: string): Promise<DataMartRelationship[]> {
    return this.repository.find({
      where: { dataStorage: { id: storageId }, projectId },
      order: { createdAt: 'ASC' },
    });
  }

  async findById(id: string): Promise<DataMartRelationship | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findByIds(ids: string[]): Promise<DataMartRelationship[]> {
    if (ids.length === 0) return [];
    return this.repository.find({ where: { id: In(ids) } });
  }

  async update(
    relationship: DataMartRelationship,
    command: UpdateRelationshipCommand
  ): Promise<DataMartRelationship> {
    if (command.targetAlias !== undefined) {
      relationship.targetAlias = command.targetAlias;
    }
    if (command.joinConditions !== undefined) {
      relationship.joinConditions = command.joinConditions;
    }

    return this.repository.save(relationship);
  }

  async delete(relationship: DataMartRelationship): Promise<void> {
    await this.repository.remove(relationship);
  }

  async deleteAllByDataMartId(dataMartId: string): Promise<void> {
    const relationships = await this.repository.find({
      where: [{ sourceDataMart: { id: dataMartId } }, { targetDataMart: { id: dataMartId } }],
    });
    if (relationships.length === 0) return;
    await this.repository.remove(relationships);
  }

  validateJoinFieldTypes(
    sourceSchema: DataMartSchema | undefined,
    targetSchema: DataMartSchema | undefined,
    joinConditions: JoinCondition[]
  ): { warnings: string[] } {
    const warnings: string[] = [];

    if (!sourceSchema || !targetSchema) return { warnings };

    const sourceFields = sourceSchema.fields ?? [];
    const targetFields = targetSchema.fields ?? [];

    for (const condition of joinConditions) {
      const sourceField = sourceFields.find(f => f.name === condition.sourceFieldName);
      const targetField = targetFields.find(f => f.name === condition.targetFieldName);

      if (!sourceField || !targetField) {
        const missing = !sourceField ? condition.sourceFieldName : condition.targetFieldName;
        warnings.push(`Field not found in schema: ${missing}`);
        continue;
      }

      if (!isPrimitiveFieldType(sourceField.type)) {
        throw new BusinessViolationException(
          `Field "${condition.sourceFieldName}" has complex type "${sourceField.type}" which cannot be used in join conditions`
        );
      }

      if (!isPrimitiveFieldType(targetField.type)) {
        throw new BusinessViolationException(
          `Field "${condition.targetFieldName}" has complex type "${targetField.type}" which cannot be used in join conditions`
        );
      }

      if (!areTypesCompatible(sourceField.type, targetField.type)) {
        throw new BusinessViolationException(
          `Incompatible types: "${condition.sourceFieldName}" (${sourceField.type}) and "${condition.targetFieldName}" (${targetField.type})`
        );
      }
    }

    return { warnings };
  }

  validateNoSelfReference(sourceId: string, targetId: string): void {
    if (sourceId === targetId) {
      throw new BusinessViolationException('A data mart cannot have a relationship with itself', {
        sourceId,
        targetId,
      });
    }
  }

  validateSameStorage(sourceStorageId: string, targetStorageId: string): void {
    if (sourceStorageId !== targetStorageId) {
      throw new BusinessViolationException(
        'Source and target data marts must belong to the same storage',
        { sourceStorageId, targetStorageId }
      );
    }
  }

  async validateUniqueAlias(
    sourceDataMartId: string,
    alias: string,
    excludeId?: string
  ): Promise<void> {
    // Pre-check complements the `UQ_data_mart_relationship_source_alias` DB constraint
    // so callers get a domain error rather than a raw driver exception on conflict.
    const conflict = await this.repository.findOne({
      where: { sourceDataMart: { id: sourceDataMartId }, targetAlias: alias },
    });

    if (conflict && conflict.id !== excludeId) {
      throw new BusinessViolationException(
        `Alias "${alias}" is already used in another relationship for this data mart`,
        { sourceDataMartId, alias, conflictingRelationshipId: conflict.id }
      );
    }
  }
}
