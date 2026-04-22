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
import { DataStorage } from '../entities/data-storage.entity';
import { JoinCondition } from '../dto/schemas/relationship-schemas';

@Injectable()
export class DataMartRelationshipService {
  constructor(
    @InjectRepository(DataMartRelationship)
    private readonly repository: Repository<DataMartRelationship>
  ) {}

  async create(
    command: CreateRelationshipCommand,
    sourceDataMart: DataMart
  ): Promise<DataMartRelationship> {
    const relationship = this.repository.create({
      sourceDataMart: { id: command.sourceDataMartId } as DataMart,
      targetDataMart: { id: command.targetDataMartId } as DataMart,
      dataStorage: { id: sourceDataMart.storage.id } as DataStorage,
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

  async findByStorageId(storageId: string, projectId?: string): Promise<DataMartRelationship[]> {
    return this.repository.find({
      where: { dataStorage: { id: storageId }, ...(projectId ? { projectId } : {}) },
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

  async detectCycles(
    sourceDataMartId: string,
    targetDataMartId: string,
    storageId: string
  ): Promise<boolean> {
    const allRelationships = await this.findByStorageId(storageId);

    // Adding source → target creates a cycle iff target can already reach source via
    // existing edges — so the adjacency list excludes the proposed edge.
    const adjacency = new Map<string, Set<string>>();
    for (const rel of allRelationships) {
      const from = rel.sourceDataMart.id;
      const to = rel.targetDataMart.id;
      if (!adjacency.has(from)) {
        adjacency.set(from, new Set());
      }
      adjacency.get(from)!.add(to);
    }

    return this.dfsCanReach(adjacency, targetDataMartId, sourceDataMartId, new Set());
  }

  private dfsCanReach(
    adjacency: Map<string, Set<string>>,
    current: string,
    target: string,
    visited: Set<string>
  ): boolean {
    if (current === target) {
      return true;
    }
    if (visited.has(current)) {
      return false;
    }

    visited.add(current);

    const neighbors = adjacency.get(current);
    if (!neighbors) {
      return false;
    }

    for (const neighbor of neighbors) {
      if (this.dfsCanReach(adjacency, neighbor, target, visited)) {
        return true;
      }
    }

    return false;
  }
}
