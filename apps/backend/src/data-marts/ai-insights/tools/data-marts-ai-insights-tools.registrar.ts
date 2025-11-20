import { Injectable } from '@nestjs/common';
import { AiInsightsToolsRegistrar } from '../../../common/ai-insights/services/ai-insights-tools-registrar';
import { ToolRegistryService } from '../../../common/ai-insights/agent/tool-registry.service';
import {
  GetMetadataInput,
  GetMetadataInputSchema,
  GetMetadataOutput,
  SqlDryRunInput,
  SqlDryRunInputSchema,
  SqlDryRunOutput,
  SqlExecuteInput,
  SqlExecuteInputSchema,
  SqlExecuteOutput,
  GetFullyQualifiedTableNameInput,
  GetFullyQualifiedTableNameInputSchema,
  FullyQualifiedTableNameOutput,
  FinalizeInsightInputSchema,
  FinalizeInsightInput,
  FinalizeInsightOutput,
  QueryRow,
} from '../ai-insights-types';
import { DataMartService } from '../../services/data-mart.service';
import { SqlDryRunService } from '../../use-cases/sql-dry-run.service';
import { SqlDryRunCommand } from '../../dto/domain/sql-dry-run.command';
import { SqlRunService } from '../../use-cases/sql-run.service';
import { TableNameRetrieverTool } from './table-name-retriever.tool';
import { DataMartInsightsContext } from '../ai-insights-types';

function isSelectOnly(sql: string): boolean {
  const cleaned = sql
    .trim()
    .replace(/^--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();
  return /^(WITH|SELECT)\b/i.test(cleaned);
}

export enum DataMartsAiInsightsTools {
  GET_DATAMART_METADATA = 'schema_get_metadata',
  SQL_DRY_RUN = 'sql_dry_run',
  SQL_EXECUTE = 'sql_execute',
  GET_TABLE_FULLY_QUALIFIED_NAME = 'table_get_fqn',
  FINALIZE = 'insight_finalize',
}

@Injectable()
export class DataMartsAiInsightsToolsRegistrar implements AiInsightsToolsRegistrar {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly sqlDryRunService: SqlDryRunService,
    private readonly sqlRunService: SqlRunService,
    private readonly tableNameRetrieverTool: TableNameRetrieverTool
  ) {}

  registerTools(registry: ToolRegistryService): void {
    registry.register({
      name: DataMartsAiInsightsTools.FINALIZE,
      description:
        'Finalize the insight. Use this tool exactly once when you are ready with the final answer. ' +
        'You MUST provide: the original prompt, the final Markdown answer, and the SQL or code (artifact) used to get the result.',
      inputJsonSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', minLength: 1 },
          promptAnswer: { type: 'string', minLength: 1 },
          artifact: { type: 'string', minLength: 1 },
        },
        required: ['prompt', 'promptAnswer', 'artifact'],
        additionalProperties: false,
      },
      inputZod: FinalizeInsightInputSchema,
      execute: async (
        args: FinalizeInsightInput,
        context: DataMartInsightsContext
      ): Promise<FinalizeInsightOutput> => {
        return {
          promptAnswer: args.promptAnswer,
          meta: {
            prompt: args.prompt,
            artifact: args.artifact,
            telemetry: context.telemetry,
          },
        };
      },
      isFinal: true,
    });

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
          schema: dataMart.schema,
        };
      },
      isFinal: false,
    });

    registry.register({
      name: DataMartsAiInsightsTools.SQL_DRY_RUN,
      description: 'Dry-run a SQL to estimate bytes processed. Only SELECT/WITH allowed.',
      inputJsonSchema: {
        type: 'object',
        properties: {
          sql: { type: 'string', minLength: 1 },
        },
        required: ['sql'],
        additionalProperties: false,
      },
      inputZod: SqlDryRunInputSchema,
      execute: async (
        args: SqlDryRunInput,
        context: DataMartInsightsContext
      ): Promise<SqlDryRunOutput> => {
        if (!isSelectOnly(args.sql)) {
          return { isValid: false, error: 'Only SELECT/WITH queries are allowed in dry-run' };
        }
        const res = await this.sqlDryRunService.run(
          new SqlDryRunCommand(context.dataMartId, context.projectId, args.sql)
        );
        return { isValid: res.isValid, error: res.error, bytes: res.bytes };
      },
      isFinal: false,
    });

    registry.register({
      name: DataMartsAiInsightsTools.SQL_EXECUTE,
      description:
        'Execute a read-only SQL and return columns and rows. Only SELECT/WITH allowed. BigQuery, Athena supported.',
      inputJsonSchema: {
        type: 'object',
        properties: {
          sql: { type: 'string', minLength: 1 },
          maxRows: { type: 'number', minimum: 1, maximum: 100 },
        },
        required: ['sql'],
        additionalProperties: false,
      },
      inputZod: SqlExecuteInputSchema,
      execute: async (
        args: SqlExecuteInput,
        context: DataMartInsightsContext
      ): Promise<SqlExecuteOutput> => {
        if (!isSelectOnly(args.sql)) {
          throw new Error('Only SELECT/WITH queries are allowed for execution');
        }

        const rows: QueryRow[] = [];
        for await (const row of this.sqlRunService.runRows<QueryRow>({
          dataMartId: context.dataMartId,
          projectId: context.projectId,
          sql: args.sql,
          limit: args.maxRows ?? context.budgets?.maxRows ?? 30,
        })) {
          rows.push(row);
        }
        const columns = rows.length ? Object.keys(rows[0]) : [];
        return { columns, rows };
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
        const tableNamae = await this.tableNameRetrieverTool.retrieveTableName(
          context.dataMartId,
          context.projectId
        );
        return { fullyQualifiedName: tableNamae };
      },
      isFinal: false,
    });
  }
}
