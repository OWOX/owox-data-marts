import { Injectable } from '@nestjs/common';
import { AuthorizationContext } from '../../idp';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import { CreateRelationshipCommand } from '../dto/domain/create-relationship.command';
import { UpdateRelationshipCommand } from '../dto/domain/update-relationship.command';
import { GetRelationshipCommand } from '../dto/domain/get-relationship.command';
import { DeleteRelationshipCommand } from '../dto/domain/delete-relationship.command';
import { ListRelationshipsCommand } from '../dto/domain/list-relationships.command';
import { ListRelationshipsByStorageCommand } from '../dto/domain/list-relationships-by-storage.command';
import { RelationshipDto } from '../dto/domain/relationship.dto';
import {
  CreateRelationshipRequestApiDto,
  JoinConditionApiDto,
} from '../dto/presentation/create-relationship-request-api.dto';
import { UpdateRelationshipRequestApiDto } from '../dto/presentation/update-relationship-request-api.dto';
import { RelationshipResponseApiDto } from '../dto/presentation/relationship-response-api.dto';
import { JoinCondition } from '../dto/schemas/relationship-schemas';
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
      context.userId,
      context.projectId,
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
      context.userId,
      context.projectId,
      context.roles ?? [],
      dto.targetAlias,
      dto.joinConditions?.map(c => this.toJoinCondition(c))
    );
  }

  toGetCommand(
    relationshipId: string,
    dataMartId: string,
    context: AuthorizationContext
  ): GetRelationshipCommand {
    return new GetRelationshipCommand(
      relationshipId,
      dataMartId,
      context.userId,
      context.projectId,
      context.roles ?? []
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
      context.userId,
      context.projectId,
      context.roles ?? []
    );
  }

  toListCommand(dataMartId: string, context: AuthorizationContext): ListRelationshipsCommand {
    return new ListRelationshipsCommand(
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

  toDomainDto(
    entity: DataMartRelationship,
    createdByUser: UserProjectionDto | null = null
  ): RelationshipDto {
    return {
      id: entity.id,
      dataStorageId: entity.dataStorage.id,
      sourceDataMart: {
        id: entity.sourceDataMart.id,
        title: entity.sourceDataMart.title,
        description: entity.sourceDataMart.description,
        status: entity.sourceDataMart.status,
      },
      targetDataMart: {
        id: entity.targetDataMart.id,
        title: entity.targetDataMart.title,
        description: entity.targetDataMart.description,
        status: entity.targetDataMart.status,
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
    userProjectionsList?: UserProjectionsListDto
  ): RelationshipDto[] {
    return entities.map(entity =>
      this.toDomainDto(
        entity,
        entity.createdById ? (userProjectionsList?.getByUserId(entity.createdById) ?? null) : null
      )
    );
  }

  toResponse(dto: RelationshipDto): RelationshipResponseApiDto {
    return { ...dto, createdByUser: dto.createdByUser ?? null };
  }

  toResponseList(dtos: RelationshipDto[]): RelationshipResponseApiDto[] {
    return dtos.map(dto => this.toResponse(dto));
  }

  private toJoinCondition(dto: JoinConditionApiDto): JoinCondition {
    return {
      sourceFieldName: dto.sourceFieldName,
      targetFieldName: dto.targetFieldName,
    };
  }
}
