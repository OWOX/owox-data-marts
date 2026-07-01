import { Injectable } from '@nestjs/common';
import { AI_INSIGHTS_SCHEMA_EXPIRES_AFTER_MS } from '../ai-insights/ai-insights.constants';
import { prepareSchema } from '../ai-insights/utils/prepare-schema';
import type {
  DataMartSchema,
  DataMartSchemaField,
} from '../data-storage-types/data-mart-schema.type';
import { isConnected } from '../data-storage-types/data-mart-schema.utils';
import { GetDataMartCommand } from '../dto/domain/get-data-mart.command';
import { ListDataMartsCommand } from '../dto/domain/list-data-marts.command';
import { DataMartService } from '../services/data-mart.service';
import { GetDataMartService } from '../use-cases/get-data-mart.service';
import { ListDataMartsService } from '../use-cases/list-data-marts.service';
import {
  McpDataMartsFacade,
  McpDataMartDetailsResponse,
  McpGetDataMartDetailsRequest,
  McpListDataMartsRequest,
  McpListDataMartsResponse,
} from './mcp-data-marts.facade';

@Injectable()
export class McpDataMartsFacadeImpl implements McpDataMartsFacade {
  constructor(
    private readonly listDataMartsService: ListDataMartsService,
    private readonly getDataMartService: GetDataMartService,
    private readonly dataMartService: DataMartService
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
    };
  }

  private async ensureDataMartAccessible(request: McpGetDataMartDetailsRequest): Promise<void> {
    await this.getDataMartService.run(
      new GetDataMartCommand(request.dataMartId, request.projectId, request.userId, request.roles)
    );
  }

  private filterAvailableFields(fields: DataMartSchemaField[]): DataMartSchemaField[] {
    return fields.filter(isConnected).map(field => {
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
