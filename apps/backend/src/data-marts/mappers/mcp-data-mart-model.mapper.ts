import { Injectable } from '@nestjs/common';
import type { AuthorizationContext } from '../../idp';
import { CreateRelationshipCommand } from '../dto/domain/create-relationship.command';
import { UpdateRelationshipCommand } from '../dto/domain/update-relationship.command';
import { DeleteRelationshipCommand } from '../dto/domain/delete-relationship.command';
import { GetRelationshipGraphCommand } from '../dto/domain/get-relationship-graph.command';
import type { RelationshipDto, RelationshipDataMartRef } from '../dto/domain/relationship.dto';
import type { RelationshipGraphDto } from '../dto/domain/relationship-graph.dto';
import type { DataMartPreviewResult } from '../use-cases/preview-data-mart.service';
import type {
  McpCreateRelationshipInput,
  McpUpdateRelationshipInput,
  McpRelationshipDto,
  McpRelationshipGraphDto,
  McpRelationshipDataMartDto,
} from '../facades/mcp-data-mart-model.facade';

@Injectable()
export class McpDataMartModelMapper {
  toListCommand(actor: AuthorizationContext, dataMartId: string) {
    return new GetRelationshipGraphCommand(
      dataMartId,
      actor.projectId,
      actor.userId,
      actor.roles ?? [],
      true
    );
  }

  toCreateCommand(actor: AuthorizationContext, input: McpCreateRelationshipInput) {
    return new CreateRelationshipCommand(
      input.dataMartId,
      input.targetDataMartId,
      input.targetAlias,
      input.joinConditions.map(condition => ({
        sourceFieldName: condition.sourceFieldName,
        targetFieldName: condition.targetFieldName,
      })),
      actor.projectId,
      actor.userId,
      actor.roles ?? [],
      input.description
    );
  }

  toUpdateCommand(actor: AuthorizationContext, input: McpUpdateRelationshipInput) {
    return new UpdateRelationshipCommand(
      input.relationshipId,
      input.dataMartId,
      actor.projectId,
      actor.userId,
      actor.roles ?? [],
      input.targetAlias,
      input.joinConditions?.map(condition => ({
        sourceFieldName: condition.sourceFieldName,
        targetFieldName: condition.targetFieldName,
      })),
      input.description
    );
  }

  toDeleteCommand(actor: AuthorizationContext, dataMartId: string, relationshipId: string) {
    return new DeleteRelationshipCommand(
      relationshipId,
      dataMartId,
      actor.projectId,
      actor.userId,
      actor.roles ?? []
    );
  }

  toRelationship(result: RelationshipDto): McpRelationshipDto {
    return {
      id: result.id,
      dataStorageId: result.dataStorageId,
      sourceDataMart: this.toDataMartRef(result.sourceDataMart),
      targetDataMart: this.toDataMartRef(result.targetDataMart),
      targetAlias: result.targetAlias,
      joinConditions: result.joinConditions.map(condition => ({
        sourceFieldName: condition.sourceFieldName,
        targetFieldName: condition.targetFieldName,
      })),
      description: result.description,
      createdAt: result.createdAt.toISOString(),
      modifiedAt: result.modifiedAt.toISOString(),
    };
  }

  toGraph(result: RelationshipGraphDto): McpRelationshipGraphDto {
    return {
      rootDataMartId: result.rootDataMartId,
      nodes: result.nodes.map(node => ({
        relationship: this.toRelationship(node.relationship),
        aliasPath: node.aliasPath,
        depth: node.depth,
        isCycleStub: node.isCycleStub,
        isBlocked: node.isBlocked,
      })),
    };
  }

  toPreview(result: DataMartPreviewResult): DataMartPreviewResult {
    return {
      columns: result.columns.map(column => ({
        name: column.name,
        alias: column.alias,
        type: column.type,
      })),
      rows: result.rows.map(row => [...row]),
      rowCount: result.rowCount,
      limit: result.limit,
      truncated: result.truncated,
    };
  }

  private toDataMartRef(ref: RelationshipDataMartRef): McpRelationshipDataMartDto {
    if (!ref.userHasAccess) return { id: ref.id, userHasAccess: false };
    return {
      id: ref.id,
      userHasAccess: true,
      title: ref.title,
      description: ref.description ?? undefined,
      status: ref.status,
      hasPrimaryKey: ref.hasPrimaryKey,
    };
  }
}
