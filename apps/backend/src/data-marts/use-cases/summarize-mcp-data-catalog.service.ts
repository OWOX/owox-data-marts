import { Injectable } from '@nestjs/common';
import { DataMartRelationshipGraphEdgeDto } from '../dto/domain/data-mart-relationship-graph-edge.dto';
import { McpDataCatalogSummaryCandidateDto } from '../dto/domain/mcp-data-catalog-summary-candidate.dto';
import {
  McpDataCatalogSummaryDto,
  McpDataCatalogSummaryItemDto,
} from '../dto/domain/mcp-data-catalog-summary.dto';
import { SummarizeMcpDataCatalogCommand } from '../dto/domain/summarize-mcp-data-catalog.command';
import { RoleScope } from '../enums/role-scope.enum';
import { ContextAccessService } from '../services/context/context-access.service';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import { McpDataCatalogSummaryService } from '../services/mcp-data-catalog-summary.service';

const MAX_SUMMARY_DESCRIPTION_LENGTH = 300;
const MAX_SUMMARY_DATA_MARTS = 10;
const MAX_RELATIONSHIP_TRAVERSAL_STEPS = 100_000;

@Injectable()
export class SummarizeMcpDataCatalogService {
  constructor(
    private readonly catalogSummaryService: McpDataCatalogSummaryService,
    private readonly relationshipService: DataMartRelationshipService,
    private readonly contextAccessService: ContextAccessService
  ) {}

  async run(command: SummarizeMcpDataCatalogCommand): Promise<McpDataCatalogSummaryDto> {
    const roleScope = await this.getRoleScope(command);
    const publishedDataMarts = await this.catalogSummaryService.findPublishedVisibleDataMarts({
      projectId: command.projectId,
      userId: command.userId,
      roles: command.roles,
      roleScope,
    });
    const publishedIds = publishedDataMarts.map(item => item.id);
    const visiblePublishedIds = new Set(publishedIds);
    const relationships =
      publishedIds.length === 0
        ? []
        : await this.relationshipService.findGraphEdgesByProjectIdAndSourceDataMartIds(
            command.projectId,
            publishedIds
          );

    const relationshipsBySource = this.groupEligibleRelationships(
      relationships,
      visiblePublishedIds
    );
    const summaries = publishedDataMarts.map(item =>
      this.toSummaryItem(item, this.countReachableRelationships(item.id, relationshipsBySource))
    );

    return {
      projectId: command.projectId,
      dataMartCount: publishedDataMarts.length,
      topDataMartsByConnectivity: summaries
        .sort((a, b) => this.compareSummaryItems(a, b))
        .slice(0, MAX_SUMMARY_DATA_MARTS),
    };
  }

  private async getRoleScope(command: SummarizeMcpDataCatalogCommand): Promise<RoleScope> {
    if (command.roles.includes('admin')) return RoleScope.ENTIRE_PROJECT;
    return this.contextAccessService.getRoleScope(command.userId, command.projectId);
  }

  private groupEligibleRelationships(
    relationships: DataMartRelationshipGraphEdgeDto[],
    visiblePublishedIds: ReadonlySet<string>
  ): Map<string, DataMartRelationshipGraphEdgeDto[]> {
    const bySource = new Map<string, DataMartRelationshipGraphEdgeDto[]>();
    for (const relationship of relationships) {
      const sourceId = relationship.sourceDataMartId;
      const targetId = relationship.targetDataMartId;
      if (!visiblePublishedIds.has(sourceId) || !visiblePublishedIds.has(targetId)) continue;
      if (!relationship.joinConditions || relationship.joinConditions.length === 0) continue;
      const list = bySource.get(sourceId);
      if (list) list.push(relationship);
      else bySource.set(sourceId, [relationship]);
    }
    return bySource;
  }

  private countReachableRelationships(
    rootId: string,
    relationshipsBySource: ReadonlyMap<string, DataMartRelationshipGraphEdgeDto[]>
  ): number {
    const countedRelationshipIds = new Set<string>();
    const path = new Set<string>([rootId]);
    let traversalSteps = 0;
    let traversalLimitReached = false;

    const walk = (sourceId: string): void => {
      if (traversalLimitReached) return;

      for (const relationship of relationshipsBySource.get(sourceId) ?? []) {
        if (traversalLimitReached) return;

        // Catalog summary ranking is best-effort; cap pathological dense/cyclic graphs.
        traversalSteps += 1;
        if (traversalSteps > MAX_RELATIONSHIP_TRAVERSAL_STEPS) {
          traversalLimitReached = true;
          return;
        }

        const targetId = relationship.targetDataMartId;
        if (path.has(targetId)) continue;

        countedRelationshipIds.add(relationship.id);
        path.add(targetId);
        walk(targetId);
        path.delete(targetId);
      }
    };

    walk(rootId);
    return countedRelationshipIds.size;
  }

  private toSummaryItem(
    item: McpDataCatalogSummaryCandidateDto,
    relationshipCount: number
  ): McpDataCatalogSummaryItemDto {
    return {
      id: item.id,
      title: item.title,
      description: this.truncateDescription(item.description ?? ''),
      relationshipCount,
      reportsCount: item.reportsCount,
      triggersCount: item.triggersCount,
      updatedAt: item.modifiedAt.toISOString(),
    };
  }

  private truncateDescription(description: string): string {
    const normalized = description.trim().replace(/\s+/g, ' ');
    if (normalized.length <= MAX_SUMMARY_DESCRIPTION_LENGTH) return normalized;
    return `${normalized.slice(0, MAX_SUMMARY_DESCRIPTION_LENGTH)}...`;
  }

  private compareSummaryItems(
    left: McpDataCatalogSummaryItemDto,
    right: McpDataCatalogSummaryItemDto
  ): number {
    return (
      right.relationshipCount - left.relationshipCount ||
      right.reportsCount + right.triggersCount - (left.reportsCount + left.triggersCount) ||
      Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    );
  }
}
