import { Injectable } from '@nestjs/common';
import { AuthorizationContext } from '../../idp';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import { CreateRelationshipCommand } from '../dto/domain/create-relationship.command';
import { UpdateRelationshipCommand } from '../dto/domain/update-relationship.command';
import { DeleteRelationshipCommand } from '../dto/domain/delete-relationship.command';
import { ListRelationshipsByStorageCommand } from '../dto/domain/list-relationships-by-storage.command';
import { GetRelationshipGraphCommand } from '../dto/domain/get-relationship-graph.command';
import { RelationshipDto } from '../dto/domain/relationship.dto';
import { RelationshipGraphDto } from '../dto/domain/relationship-graph.dto';
import {
  CreateRelationshipRequestApiDto,
  JoinConditionApiDto,
} from '../dto/presentation/create-relationship-request-api.dto';
import { UpdateRelationshipRequestApiDto } from '../dto/presentation/update-relationship-request-api.dto';
import { RelationshipResponseApiDto } from '../dto/presentation/relationship-response-api.dto';
import { RelationshipGraphResponseApiDto } from '../dto/presentation/relationship-graph-response-api.dto';
import { JoinCondition } from '../dto/schemas/join-condition.schema';
import { UserProjectionDto } from '../../idp/dto/domain/user-projection.dto';
import { UserProjectionsListDto } from '../../idp/dto/domain/user-projections-list.dto';

@Injectable()
export class RelationshipMapper {
  toCreateCommand(
    dataMartId: string,
    context: AuthorizationContext,
    dto: CreateRelationshipRequestApiDto
  ): CreateRelationshipCommand {
    return new CreateRelationshipCommand(
      dataMartId,
      dto.targetDataMartId,
      dto.targetAlias,
      dto.joinConditions.map(c => this.toJoinCondition(c)),
      context.projectId,
      context.userId,
      context.roles ?? []
    );
  }

  toUpdateCommand(
    relationshipId: string,
    dataMartId: string,
    context: AuthorizationContext,
    dto: UpdateRelationshipRequestApiDto
  ): UpdateRelationshipCommand {
    return new UpdateRelationshipCommand(
      relationshipId,
      dataMartId,
      context.projectId,
      context.userId,
      context.roles ?? [],
      dto.targetAlias,
      dto.joinConditions?.map(c => this.toJoinCondition(c))
    );
  }

  toDeleteCommand(
    relationshipId: string,
    dataMartId: string,
    context: AuthorizationContext
  ): DeleteRelationshipCommand {
    return new DeleteRelationshipCommand(
      relationshipId,
      dataMartId,
      context.projectId,
      context.userId,
      context.roles ?? []
    );
  }

  toListByStorageCommand(
    storageId: string,
    context: AuthorizationContext
  ): ListRelationshipsByStorageCommand {
    return new ListRelationshipsByStorageCommand(
      storageId,
      context.projectId,
      context.userId,
      context.roles ?? []
    );
  }

  toGetRelationshipGraphCommand(
    rootDataMartId: string,
    context: AuthorizationContext
  ): GetRelationshipGraphCommand {
    return new GetRelationshipGraphCommand(
      rootDataMartId,
      context.projectId,
      context.userId,
      context.roles ?? []
    );
  }

  toDomainDto(
    entity: DataMartRelationship,
    createdByUser: UserProjectionDto | null,
    accessByDataMartId: ReadonlyMap<string, boolean>
  ): RelationshipDto {
    return {
      id: entity.id,
      dataStorageId: entity.dataStorage.id,
      sourceDataMart: {
        id: entity.sourceDataMart.id,
        title: entity.sourceDataMart.title,
        description: entity.sourceDataMart.description,
        status: entity.sourceDataMart.status,
        userHasAccess: accessByDataMartId.get(entity.sourceDataMart.id) ?? false,
      },
      targetDataMart: {
        id: entity.targetDataMart.id,
        title: entity.targetDataMart.title,
        description: entity.targetDataMart.description,
        status: entity.targetDataMart.status,
        userHasAccess: accessByDataMartId.get(entity.targetDataMart.id) ?? false,
      },
      targetAlias: entity.targetAlias,
      joinConditions: entity.joinConditions,
      createdById: entity.createdById,
      createdAt: entity.createdAt,
      modifiedAt: entity.modifiedAt,
      createdByUser,
    };
  }

  toDomainDtoList(
    entities: DataMartRelationship[],
    userProjectionsList: UserProjectionsListDto | undefined,
    accessByDataMartId: ReadonlyMap<string, boolean>
  ): RelationshipDto[] {
    return entities.map(entity =>
      this.toDomainDto(
        entity,
        entity.createdById ? (userProjectionsList?.getByUserId(entity.createdById) ?? null) : null,
        accessByDataMartId
      )
    );
  }

  toResponse(dto: RelationshipDto): RelationshipResponseApiDto {
    return { ...dto, createdByUser: dto.createdByUser ?? null };
  }

  toResponseList(dtos: RelationshipDto[]): RelationshipResponseApiDto[] {
    return dtos.map(dto => this.toResponse(dto));
  }

  toGraphResponse(dto: RelationshipGraphDto): RelationshipGraphResponseApiDto {
    return {
      rootDataMartId: dto.rootDataMartId,
      nodes: dto.nodes.map(node => ({
        relationship: this.toResponse(node.relationship),
        aliasPath: node.aliasPath,
        depth: node.depth,
        isCycleStub: node.isCycleStub,
        isBlocked: node.isBlocked,
      })),
    };
  }

  private toJoinCondition(dto: JoinConditionApiDto): JoinCondition {
    return {
      sourceFieldName: dto.sourceFieldName,
      targetFieldName: dto.targetFieldName,
    };
  }
}
