import { Injectable } from '@nestjs/common';
import { AuthorizationContext } from '../../idp';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import { CreateRelationshipCommand } from '../dto/domain/create-relationship.command';
import { UpdateRelationshipCommand } from '../dto/domain/update-relationship.command';
import { GetRelationshipCommand } from '../dto/domain/get-relationship.command';
import {
  BlendedFieldApiDto,
  CreateRelationshipRequestApiDto,
  JoinConditionApiDto,
} from '../dto/presentation/create-relationship-request-api.dto';
import { UpdateRelationshipRequestApiDto } from '../dto/presentation/update-relationship-request-api.dto';
import { RelationshipResponseApiDto } from '../dto/presentation/relationship-response-api.dto';
import { BlendedFieldConfig, JoinCondition } from '../dto/schemas/relationship-schemas';

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
      dto.blendedFields.map(f => this.toBlendedFieldConfig(f)),
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
      dto.joinConditions?.map(c => this.toJoinCondition(c)),
      dto.blendedFields?.map(f => this.toBlendedFieldConfig(f))
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

  toResponse(entity: DataMartRelationship): RelationshipResponseApiDto {
    return {
      id: entity.id,
      dataStorageId: entity.dataStorage.id,
      sourceDataMart: {
        id: entity.sourceDataMart.id,
        title: entity.sourceDataMart.title,
        description: entity.sourceDataMart.description,
      },
      targetDataMart: {
        id: entity.targetDataMart.id,
        title: entity.targetDataMart.title,
        description: entity.targetDataMart.description,
      },
      targetAlias: entity.targetAlias,
      joinConditions: entity.joinConditions,
      blendedFields: entity.blendedFields,
      createdById: entity.createdById,
      createdAt: entity.createdAt,
      modifiedAt: entity.modifiedAt,
    };
  }

  toResponseList(entities: DataMartRelationship[]): RelationshipResponseApiDto[] {
    return entities.map(entity => this.toResponse(entity));
  }

  private toJoinCondition(dto: JoinConditionApiDto): JoinCondition {
    return {
      sourceFieldName: dto.sourceFieldName,
      targetFieldName: dto.targetFieldName,
    };
  }

  private toBlendedFieldConfig(dto: BlendedFieldApiDto): BlendedFieldConfig {
    return {
      targetFieldName: dto.targetFieldName,
      outputAlias: dto.outputAlias,
      isHidden: dto.isHidden ?? false,
      aggregateFunction: dto.aggregateFunction ?? 'STRING_AGG',
    };
  }
}
