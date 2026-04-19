import { Injectable } from '@nestjs/common';
import { AuthorizationContext } from '../../idp';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import { CreateRelationshipCommand } from '../dto/domain/create-relationship.command';
import { UpdateRelationshipCommand } from '../dto/domain/update-relationship.command';
import { GetRelationshipCommand } from '../dto/domain/get-relationship.command';
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
      context.projectId
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
      context.projectId
    );
  }

  toResponse(
    entity: DataMartRelationship,
    createdByUser: UserProjectionDto | null = null
  ): RelationshipResponseApiDto {
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

  toResponseList(
    entities: DataMartRelationship[],
    userProjectionsList?: UserProjectionsListDto
  ): RelationshipResponseApiDto[] {
    return entities.map(entity =>
      this.toResponse(
        entity,
        entity.createdById ? (userProjectionsList?.getByUserId(entity.createdById) ?? null) : null
      )
    );
  }

  private toJoinCondition(dto: JoinConditionApiDto): JoinCondition {
    return {
      sourceFieldName: dto.sourceFieldName,
      targetFieldName: dto.targetFieldName,
    };
  }
}
