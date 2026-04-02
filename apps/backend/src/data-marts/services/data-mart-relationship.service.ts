import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { CreateRelationshipCommand } from '../dto/domain/create-relationship.command';
import { UpdateRelationshipCommand } from '../dto/domain/update-relationship.command';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import { DataStorage } from '../entities/data-storage.entity';

const MAX_CYCLE_DEPTH = 10;

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
      blendedFields: command.blendedFields,
      projectId: command.projectId,
      createdById: command.userId,
    });

    return this.repository.save(relationship);
  }

  async findBySourceDataMartId(sourceDataMartId: string): Promise<DataMartRelationship[]> {
    return this.repository.find({
      where: { sourceDataMart: { id: sourceDataMartId } },
      relations: ['sourceDataMart', 'targetDataMart', 'dataStorage'],
    });
  }

  async findByStorageId(storageId: string): Promise<DataMartRelationship[]> {
    return this.repository.find({
      where: { dataStorage: { id: storageId } },
      relations: ['sourceDataMart', 'targetDataMart', 'dataStorage'],
    });
  }

  async findById(id: string): Promise<DataMartRelationship | null> {
    return this.repository.findOne({
      where: { id },
      relations: ['sourceDataMart', 'targetDataMart', 'dataStorage'],
    });
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
    if (command.blendedFields !== undefined) {
      relationship.blendedFields = command.blendedFields;
    }

    return this.repository.save(relationship);
  }

  async delete(relationship: DataMartRelationship): Promise<void> {
    await this.repository.remove(relationship);
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
    const existing = await this.findBySourceDataMartId(sourceDataMartId);
    const conflict = existing.find(rel => rel.targetAlias === alias && rel.id !== excludeId);

    if (conflict) {
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

    // Build adjacency list from existing relationships
    const adjacency = new Map<string, Set<string>>();

    for (const rel of allRelationships) {
      const from = rel.sourceDataMart.id;
      const to = rel.targetDataMart.id;

      if (!adjacency.has(from)) {
        adjacency.set(from, new Set());
      }
      adjacency.get(from)!.add(to);
    }

    // Add the proposed edge
    if (!adjacency.has(targetDataMartId)) {
      adjacency.set(targetDataMartId, new Set());
    }
    adjacency.get(targetDataMartId)!.add(sourceDataMartId);

    // DFS from targetDataMartId to check if it can reach sourceDataMartId
    // The proposed edge is targetDataMartId → sourceDataMartId (reversed to check for cycle:
    // original proposed edge is sourceDataMartId → targetDataMartId,
    // so a cycle exists if targetDataMartId can already reach sourceDataMartId via existing edges)
    // Reset: check original direction — does targetDataMartId reach sourceDataMartId through
    // existing edges (before adding proposed edge)?
    // If yes → adding sourceDataMartId → targetDataMartId would create a cycle.

    const adjacencyOriginal = new Map<string, Set<string>>();
    for (const rel of allRelationships) {
      const from = rel.sourceDataMart.id;
      const to = rel.targetDataMart.id;
      if (!adjacencyOriginal.has(from)) {
        adjacencyOriginal.set(from, new Set());
      }
      adjacencyOriginal.get(from)!.add(to);
    }

    return this.dfsCanReach(adjacencyOriginal, targetDataMartId, sourceDataMartId, 0);
  }

  private dfsCanReach(
    adjacency: Map<string, Set<string>>,
    current: string,
    target: string,
    depth: number,
    visited: Set<string> = new Set()
  ): boolean {
    if (depth > MAX_CYCLE_DEPTH) {
      return false;
    }
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
      if (this.dfsCanReach(adjacency, neighbor, target, depth + 1, visited)) {
        return true;
      }
    }

    return false;
  }
}
