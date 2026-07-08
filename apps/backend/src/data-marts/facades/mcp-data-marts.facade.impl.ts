import { Injectable, Logger } from '@nestjs/common';
import { AI_INSIGHTS_SCHEMA_EXPIRES_AFTER_MS } from '../ai-insights/ai-insights.constants';
import { prepareSchema } from '../ai-insights/utils/prepare-schema';
import type {
  DataMartSchema,
  DataMartSchemaField,
} from '../data-storage-types/data-mart-schema.type';
import { isConnected } from '../data-storage-types/data-mart-schema.utils';
import { GetDataMartCommand } from '../dto/domain/get-data-mart.command';
import { ListDataMartsCommand } from '../dto/domain/list-data-marts.command';
import { SummarizeMcpDataCatalogCommand } from '../dto/domain/summarize-mcp-data-catalog.command';
import { BlendableSchemaService } from '../services/blendable-schema.service';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import { DataMartService } from '../services/data-mart.service';
import { GetDataMartService } from '../use-cases/get-data-mart.service';
import { ListDataMartsService } from '../use-cases/list-data-marts.service';
import { QueryDataMartCommand, QueryDataMartService } from '../use-cases/query-data-mart.service';
import { SummarizeMcpDataCatalogService } from '../use-cases/summarize-mcp-data-catalog.service';
import {
  McpDataCatalogSummaryResponse,
  McpDataMartsFacade,
  McpDataMartDetailsResponse,
  McpGetDataMartDetailsRequest,
  McpJoinedFieldDto,
  McpListDataMartsRequest,
  McpListDataMartsResponse,
  McpQueryDataMartRequest,
  McpQueryDataMartResponse,
  McpSummarizeDataCatalogRequest,
} from './mcp-data-marts.facade';

@Injectable()
export class McpDataMartsFacadeImpl implements McpDataMartsFacade {
  private readonly logger = new Logger(McpDataMartsFacadeImpl.name);

  constructor(
    private readonly listDataMartsService: ListDataMartsService,
    private readonly getDataMartService: GetDataMartService,
    private readonly dataMartService: DataMartService,
    private readonly queryDataMartService: QueryDataMartService,
    private readonly blendableSchemaService: BlendableSchemaService,
    private readonly relationshipService: DataMartRelationshipService,
    private readonly summarizeMcpDataCatalogService: SummarizeMcpDataCatalogService
  ) {}

  async listDataMarts(request: McpListDataMartsRequest): Promise<McpListDataMartsResponse> {
    const result = await this.listDataMartsService.run(
      new ListDataMartsCommand(request.projectId, request.userId, request.roles)
    );

    return {
      dataMarts: result.items.map(item => ({
        id: item.id,
        title: item.title,
        description: item.description,
        status: item.status,
        updatedAt: item.modifiedAt.toISOString(),
      })),
    };
  }

  async getDataMartDetails(
    request: McpGetDataMartDetailsRequest
  ): Promise<McpDataMartDetailsResponse> {
    await this.ensureDataMartAccessible(request);

    const dataMart = await this.dataMartService.actualizeSchemaIfExpired(
      request.dataMartId,
      request.projectId,
      AI_INSIGHTS_SCHEMA_EXPIRES_AFTER_MS
    );
    const schema = dataMart.schema
      ? (prepareSchema({
          ...dataMart.schema,
          fields: this.filterAvailableFields(dataMart.schema.fields),
        } as DataMartSchema) as { fields: Array<Record<string, unknown>> })
      : undefined;

    return {
      id: dataMart.id,
      name: dataMart.title,
      description: dataMart.description ?? '',
      fields: schema?.fields ?? [],
      joinedFields: await this.resolveJoinedFields(request),
    };
  }

  /**
   * Fields contributed by joined/blended data marts, with their qualified `<alias>__<field>`
   * names — best-effort, so a discovery call still returns native fields if the blend can't be
   * resolved (e.g. a deleted join target).
   */
  private async resolveJoinedFields(
    request: McpGetDataMartDetailsRequest
  ): Promise<McpJoinedFieldDto[]> {
    try {
      // No outgoing relationships → no blended fields; skip the heavier blendable-schema
      // computation on the (common) non-blended discovery path.
      const relationships = await this.relationshipService.findBySourceDataMartId(
        request.dataMartId
      );
      if (relationships.length === 0) {
        return [];
      }

      const blendable = await this.blendableSchemaService.computeBlendableSchema(
        request.dataMartId,
        request.projectId,
        { userId: request.userId, roles: request.roles }
      );

      // Expose only fields from included sources the caller may report on — mirror the report
      // UI's gate (isIncluded + isAccessibleForReporting). computeBlendableSchema resolves access
      // per source but leaves it on availableSources; without this filter we would leak the
      // schema of joined data marts the caller has no reporting access to.
      const accessiblePaths = new Set(
        blendable.availableSources
          .filter(s => s.isIncluded && s.isAccessibleForReporting)
          .map(s => s.aliasPath)
      );
      return blendable.blendedFields
        .filter(f => !f.isHidden && accessiblePaths.has(f.aliasPath))
        .map(f => ({
          name: f.name,
          type: f.type,
          description: f.description ?? '',
          sourceDataMart: f.sourceDataMartTitle,
          ...(f.postJoinAggregations?.length
            ? { allowedAggregations: f.postJoinAggregations }
            : {}),
        }));
    } catch (err) {
      this.logger.warn(
        `resolveJoinedFields failed; returning no joined fields: ${err instanceof Error ? err.message : String(err)}`
      );
      return [];
    }
  }

  async queryDataMart(
    request: McpQueryDataMartRequest,
    signal?: AbortSignal
  ): Promise<McpQueryDataMartResponse> {
    return this.queryDataMartService.run(new QueryDataMartCommand(request), signal);
  }

  async summarizeDataCatalog(
    request: McpSummarizeDataCatalogRequest
  ): Promise<McpDataCatalogSummaryResponse> {
    return this.summarizeMcpDataCatalogService.run(
      new SummarizeMcpDataCatalogCommand(request.projectId, request.userId, request.roles)
    );
  }

  private async ensureDataMartAccessible(request: McpGetDataMartDetailsRequest): Promise<void> {
    await this.getDataMartService.run(
      new GetDataMartCommand(request.dataMartId, request.projectId, request.userId, request.roles)
    );
  }

  private filterAvailableFields(fields: DataMartSchemaField[]): DataMartSchemaField[] {
    return fields
      .filter(field => isConnected(field) && !field.isHiddenForReporting)
      .map(field => {
        if (!('fields' in field) || !Array.isArray(field.fields)) {
          return field;
        }

        return {
          ...field,
          fields: this.filterAvailableFields(field.fields as DataMartSchemaField[]),
        } as DataMartSchemaField;
      });
  }
}
