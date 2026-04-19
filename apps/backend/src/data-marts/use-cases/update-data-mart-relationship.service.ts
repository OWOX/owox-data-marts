import { Injectable, NotFoundException } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { UpdateRelationshipCommand } from '../dto/domain/update-relationship.command';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import { DataMartService } from '../services/data-mart.service';

@Injectable()
export class UpdateDataMartRelationshipService {
  constructor(
    private readonly relationshipService: DataMartRelationshipService,
    private readonly dataMartService: DataMartService
  ) {}

  @Transactional()
  async run(command: UpdateRelationshipCommand): Promise<DataMartRelationship> {
    const relationship = await this.relationshipService.findById(command.relationshipId);

    if (!relationship || relationship.sourceDataMart.id !== command.sourceDataMartId) {
      throw new NotFoundException(
        `Relationship with ID ${command.relationshipId} not found for data mart ${command.sourceDataMartId}`
      );
    }

    const oldAlias = relationship.targetAlias;

    if (command.targetAlias !== undefined && command.targetAlias !== oldAlias) {
      await this.relationshipService.validateUniqueAlias(
        command.sourceDataMartId,
        command.targetAlias,
        command.relationshipId
      );
    }

    if (command.joinConditions !== undefined) {
      this.relationshipService.validateJoinFieldTypes(
        relationship.sourceDataMart.schema,
        relationship.targetDataMart.schema,
        command.joinConditions
      );
    }

    const updated = await this.relationshipService.update(relationship, command);

    // Cascade alias rename in blendedFieldsConfig paths
    if (command.targetAlias !== undefined && command.targetAlias !== oldAlias) {
      await this.cascadeAliasRename(command.sourceDataMartId, oldAlias, command.targetAlias);
    }

    return updated;
  }

  private async cascadeAliasRename(
    sourceDataMartId: string,
    oldAlias: string,
    newAlias: string
  ): Promise<void> {
    const sourceDm = await this.dataMartService.findById(sourceDataMartId);
    if (!sourceDm?.blendedFieldsConfig) return;

    let changed = false;
    const updatedSources = sourceDm.blendedFieldsConfig.sources.map(source => {
      const updatedPath = this.replaceFirstSegment(source.path, oldAlias, newAlias);
      if (updatedPath !== source.path) {
        changed = true;
        return { ...source, path: updatedPath };
      }
      return source;
    });

    if (changed) {
      sourceDm.blendedFieldsConfig = {
        ...sourceDm.blendedFieldsConfig,
        sources: updatedSources,
      };
      await this.dataMartService.save(sourceDm);
    }
  }

  private replaceFirstSegment(path: string, oldSegment: string, newSegment: string): string {
    if (path === oldSegment) return newSegment;
    if (path.startsWith(`${oldSegment}.`)) {
      return `${newSegment}${path.slice(oldSegment.length)}`;
    }
    return path;
  }
}
