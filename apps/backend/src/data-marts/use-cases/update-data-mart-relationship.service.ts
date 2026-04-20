import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { UpdateRelationshipCommand } from '../dto/domain/update-relationship.command';
import { RelationshipResponseApiDto } from '../dto/presentation/relationship-response-api.dto';
import { RelationshipMapper } from '../mappers/relationship.mapper';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import { DataMartService } from '../services/data-mart.service';
import { ReportDataCacheService } from '../services/report-data-cache.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';

@Injectable()
export class UpdateDataMartRelationshipService {
  constructor(
    private readonly relationshipService: DataMartRelationshipService,
    private readonly dataMartService: DataMartService,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly reportDataCacheService: ReportDataCacheService,
    private readonly mapper: RelationshipMapper,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  @Transactional()
  async run(command: UpdateRelationshipCommand): Promise<RelationshipResponseApiDto> {
    const relationship = await this.relationshipService.findById(command.relationshipId);

    if (!relationship || relationship.sourceDataMart.id !== command.sourceDataMartId) {
      throw new NotFoundException(
        `Relationship with ID ${command.relationshipId} not found for data mart ${command.sourceDataMartId}`
      );
    }

    if (command.userId) {
      const canEdit = await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.DATA_MART,
        relationship.sourceDataMart.id,
        Action.EDIT,
        command.projectId
      );
      if (!canEdit) {
        throw new ForbiddenException(
          'You do not have permission to manage relationships of this DataMart'
        );
      }
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

    await this.reportDataCacheService.invalidateByDataMartId(command.sourceDataMartId);

    const createdByUser = await this.userProjectionsFetcherService.fetchCreatedByUser(updated);
    return this.mapper.toResponse(updated, createdByUser);
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
