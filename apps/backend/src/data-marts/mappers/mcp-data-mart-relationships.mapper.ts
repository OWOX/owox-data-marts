import { Injectable } from '@nestjs/common';
import type { RelationshipDataMartRef, RelationshipDto } from '../dto/domain/relationship.dto';
import type { RelationshipGraphDto } from '../dto/domain/relationship-graph.dto';
import type {
  McpDataMartRelationshipDto,
  McpDataMartRelationshipGraphDto,
  McpDataMartRelationshipRef,
} from '../facades/mcp-data-mart-relationships.facade';

@Injectable()
export class McpDataMartRelationshipsMapper {
  toRelationship(dto: RelationshipDto): McpDataMartRelationshipDto {
    return {
      id: dto.id,
      dataStorageId: dto.dataStorageId,
      sourceDataMart: this.toDataMartRef(dto.sourceDataMart),
      targetDataMart: this.toDataMartRef(dto.targetDataMart),
      targetAlias: dto.targetAlias,
      joinConditions: dto.joinConditions.map(condition => ({
        sourceFieldName: condition.sourceFieldName,
        targetFieldName: condition.targetFieldName,
      })),
      description: dto.description ?? undefined,
      createdById: dto.createdById,
      createdAt: dto.createdAt.toISOString(),
      modifiedAt: dto.modifiedAt.toISOString(),
      createdByUser: dto.createdByUser
        ? {
            userId: dto.createdByUser.userId,
            fullName: dto.createdByUser.fullName,
            email: dto.createdByUser.email,
            avatar: dto.createdByUser.avatar,
          }
        : null,
    };
  }

  toGraph(dto: RelationshipGraphDto): McpDataMartRelationshipGraphDto {
    return {
      rootDataMartId: dto.rootDataMartId,
      nodes: dto.nodes.map(node => ({
        relationship: this.toRelationship(node.relationship),
        aliasPath: node.aliasPath,
        depth: node.depth,
        isCycleStub: node.isCycleStub,
        isBlocked: node.isBlocked,
      })),
    };
  }

  private toDataMartRef(dto: RelationshipDataMartRef): McpDataMartRelationshipRef {
    if (!dto.userHasAccess) {
      return { id: dto.id, userHasAccess: false };
    }
    return {
      id: dto.id,
      userHasAccess: true,
      title: dto.title,
      description: dto.description ?? undefined,
      status: dto.status,
      hasPrimaryKey: dto.hasPrimaryKey,
    };
  }
}
