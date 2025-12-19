import { Injectable } from '@nestjs/common';
import { AiInsightsToolsRegistrar } from '../../../common/ai-insights/services/ai-insights-tools-registrar';
import {
  GetMetadataInput,
  GetMetadataInputSchema,
  GetMetadataOutput,
  GetFullyQualifiedTableNameInput,
  GetFullyQualifiedTableNameInputSchema,
  FullyQualifiedTableNameOutput,
} from '../ai-insights-types';
import { DataMartService } from '../../services/data-mart.service';
import { TableNameRetrieverTool } from './table-name-retriever.tool';
import { DataMartInsightsContext } from '../ai-insights-types';
import { ToolRegistry } from '../../../common/ai-insights/agent/tool-registry';
import { filterConnectedSchema } from '../utils/narrow-datamart-metadata';

export enum DataMartsAiInsightsTools {
  GET_DATAMART_METADATA = 'schema_get_metadata',
  GET_TABLE_FULLY_QUALIFIED_NAME = 'table_get_fqn',
}

@Injectable()
export class DataMartsAiInsightsToolsRegistrar implements AiInsightsToolsRegistrar {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly tableNameRetrieverTool: TableNameRetrieverTool
  ) {}

  registerTools(registry: ToolRegistry): void {
    registry.register({
      name: DataMartsAiInsightsTools.GET_DATAMART_METADATA,
      description:
        'Get data mart metadata including title, description, storage type, and schema(structure).',
      inputJsonSchema: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
      inputZod: GetMetadataInputSchema,
      execute: async (
        _args: GetMetadataInput,
        context: DataMartInsightsContext
      ): Promise<GetMetadataOutput> => {
        const dataMart = await this.dataMartService.getByIdAndProjectId(
          context.dataMartId,
          context.projectId
        );
        return {
          title: dataMart.title,
          description: dataMart.description,
          storageType: dataMart.storage.type,
          schema: filterConnectedSchema(dataMart.schema!),
        };
      },
      isFinal: false,
    });

    registry.register({
      name: DataMartsAiInsightsTools.GET_TABLE_FULLY_QUALIFIED_NAME,
      description: 'Get Fully Qualified Table Name for the current Data Mart',
      inputJsonSchema: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
      inputZod: GetFullyQualifiedTableNameInputSchema,
      execute: async (
        _args: GetFullyQualifiedTableNameInput,
        context: DataMartInsightsContext
      ): Promise<FullyQualifiedTableNameOutput> => {
        const tableName = await this.tableNameRetrieverTool.retrieveTableName(
          context.dataMartId,
          context.projectId
        );
        return { fullyQualifiedName: tableName };
      },
      isFinal: false,
    });
  }
}
