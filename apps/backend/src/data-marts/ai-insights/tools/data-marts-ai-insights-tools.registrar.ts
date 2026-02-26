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
import {
  DataMartSampleDataService,
  SampleTableDataResult,
} from '../../services/data-mart-sample-data.service';
import { z } from 'zod';

export enum DataMartsAiInsightsTools {
  GET_DATAMART_METADATA = 'schema_get_metadata',
  GET_TABLE_FULLY_QUALIFIED_NAME = 'table_get_fqn',
  SAMPLE_TABLE_DATA = 'schema_sample_table_data',
}

const SampleTableDataInputSchema = z.object({
  columns: z
    .array(z.string().min(1))
    .min(1)
    .describe('Column names to sample from the data mart table.'),
});
type SampleTableDataInput = z.infer<typeof SampleTableDataInputSchema>;

@Injectable()
export class DataMartsAiInsightsToolsRegistrar implements AiInsightsToolsRegistrar {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly tableNameRetrieverTool: TableNameRetrieverTool,
    private readonly dataMartSampleDataService: DataMartSampleDataService
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

    registry.register({
      name: DataMartsAiInsightsTools.SAMPLE_TABLE_DATA,
      description:
        'Get sample values for specific columns from the data mart table. ' +
        'Use this to understand actual data format, allowed values, or structure ' +
        'of string-typed columns before choosing parsing/casting transforms.',
      inputJsonSchema: {
        type: 'object',
        properties: {
          columns: {
            type: 'array',
            items: { type: 'string' },
            description: 'Column names to sample.',
          },
        },
        required: ['columns'],
        additionalProperties: false,
      },
      inputZod: SampleTableDataInputSchema,
      execute: async (
        args: SampleTableDataInput,
        context: DataMartInsightsContext
      ): Promise<SampleTableDataResult> => {
        return this.dataMartSampleDataService.sampleColumns(
          context.dataMartId,
          context.projectId,
          args.columns
        );
      },
      isFinal: false,
    });
  }
}
