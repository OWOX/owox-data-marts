import { Inject, Injectable, Logger } from '@nestjs/common';
import { AI_CHAT_PROVIDER } from '../../common/ai-insights/services/ai-chat-provider.token';
import { AiChatProvider } from '../../common/ai-insights/agent/ai-core';
import { ToolRegistry } from '../../common/ai-insights/agent/tool-registry';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DataMartDefinitionValidatorFacade } from '../data-storage-types/facades/data-mart-definition-validator-facade.service';
import type { DataMartSchema } from '../data-storage-types/data-mart-schema.type';
import { DataMartSchemaFieldStatus } from '../data-storage-types/enums/data-mart-schema-field-status.enum';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataMartService } from '../services/data-mart.service';
import { DataMartSampleDataService } from '../services/data-mart-sample-data.service';
import { GenerateDataMartMetadataAgent } from './agent/generate-data-mart-metadata.agent';
import {
  DataMartMetadataScope,
  GenerateDataMartMetadataRequest,
  GenerateDataMartMetadataResponse,
  QueryRow,
  SharedAgentContext,
} from './ai-insights-types';
import { AI_INSIGHTS_SCHEMA_EXPIRES_AFTER_MS } from './ai-insights.constants';

const METADATA_SAMPLE_ROW_LIMIT = 30;

/**
 * Orchestrates a single AI metadata generation request: validates the data mart,
 * optionally fetches a 30-row sample, runs the agent, and shapes the response per scope.
 *
 * Does not emit consumption events — AI helper is a free editor convenience.
 */
@Injectable()
export class GenerateDataMartMetadataOrchestratorService {
  private readonly logger = new Logger(GenerateDataMartMetadataOrchestratorService.name);

  constructor(
    private readonly dataMartService: DataMartService,
    private readonly dataMartSampleDataService: DataMartSampleDataService,
    private readonly definitionValidatorFacade: DataMartDefinitionValidatorFacade,
    private readonly generateDataMartMetadataAgent: GenerateDataMartMetadataAgent,
    @Inject(AI_CHAT_PROVIDER)
    private readonly aiProvider: AiChatProvider,
    private readonly toolRegistry: ToolRegistry
  ) {}

  async run(request: GenerateDataMartMetadataRequest): Promise<GenerateDataMartMetadataResponse> {
    this.logger.log(
      `Generating data mart metadata for ${request.dataMartId} (scope=${request.scope}, useSample=${request.useSample})`
    );

    const dataMart = await this.dataMartService.actualizeSchemaIfExpired(
      request.dataMartId,
      request.projectId,
      AI_INSIGHTS_SCHEMA_EXPIRES_AFTER_MS
    );

    if (dataMart.definitionType === DataMartDefinitionType.CONNECTOR) {
      throw new BusinessViolationException(
        'AI metadata generation is not supported for connector-based data marts'
      );
    }

    await this.definitionValidatorFacade.checkIsValid(dataMart);

    const schema = dataMart.schema;
    if (!schema) {
      throw new BusinessViolationException(
        'Data mart has no output schema yet. Actualize the schema before requesting AI metadata.'
      );
    }

    if (this.requiresFieldName(request.scope) && !request.fieldName?.trim()) {
      throw new BusinessViolationException(`fieldName is required for scope "${request.scope}"`);
    }

    let sampleColumns: string[] | null = null;
    let sampleRows: QueryRow[] | null = null;
    if (request.useSample) {
      // DISCONNECTED fields aren't in the underlying table/view, so selecting them fails the query.
      const schemaColumns = schema.fields
        .filter(f => f.status !== DataMartSchemaFieldStatus.DISCONNECTED)
        .map(f => f.name);
      if (schemaColumns.length === 0) {
        this.logger.warn(
          `Skipping sample fetch for data mart ${request.dataMartId}: no connected schema fields`
        );
      } else {
        const sample = await this.dataMartSampleDataService.sampleColumns(
          request.dataMartId,
          request.projectId,
          schemaColumns,
          undefined,
          METADATA_SAMPLE_ROW_LIMIT
        );
        sampleColumns = sample.columns;
        sampleRows = sample.rows.map(row => this.toQueryRow(sample.columns, row));
        this.logger.log(
          `Fetched ${sample.rows.length} sample row(s) across ${sample.columns.length} column(s) for data mart ${request.dataMartId}`
        );
      }
    }

    const sharedContext: SharedAgentContext = {
      aiProvider: this.aiProvider,
      toolRegistry: this.toolRegistry,
      budgets: {},
      telemetry: {
        llmCalls: [],
        toolCalls: [],
        messageHistory: [],
      },
      projectId: request.projectId,
      dataMartId: request.dataMartId,
    };

    const aiResult = await this.generateDataMartMetadataAgent.run(
      {
        scope: request.scope,
        dataMartTitle: dataMart.title ?? null,
        dataMartDescription: dataMart.description ?? null,
        schema,
        sampleColumns,
        sampleRows,
        fieldName: request.fieldName,
      },
      sharedContext
    );

    // LLMs occasionally slip on long camelCase identifiers (e.g.
    // `firstPaidSubscriptionDateTime` -> `firstpaidsubscriptiondatetime`).
    // Map any returned field name back to its canonical schema name before
    // the exact-string filter in `shapeResponseToScope` runs.
    const normalized = this.normalizeAiFields(aiResult, schema);

    const rawNames = (aiResult.fields ?? []).map(f => f.name);
    const canonicalNames = (normalized.fields ?? []).map(f => f.name);
    this.logger.log(
      `AI returned ${rawNames.length} field(s) ` +
        `names_raw=[${rawNames.join(', ')}] names_canonical=[${canonicalNames.join(', ')}]`
    );

    return this.shapeResponseToScope(normalized, request);
  }

  private normalizeAiFields(
    aiResult: GenerateDataMartMetadataResponse,
    schema: DataMartSchema
  ): GenerateDataMartMetadataResponse {
    if (!aiResult.fields) return aiResult;
    const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const canonicalByNormalized = new Map<string, string>();
    for (const f of schema.fields) {
      canonicalByNormalized.set(norm(f.name), f.name);
    }
    return {
      ...aiResult,
      fields: aiResult.fields.map(f => ({
        ...f,
        name: canonicalByNormalized.get(norm(f.name)) ?? f.name,
      })),
    };
  }

  private requiresFieldName(scope: DataMartMetadataScope): boolean {
    return (
      scope === DataMartMetadataScope.FIELD_ALIAS ||
      scope === DataMartMetadataScope.FIELD_DESCRIPTION
    );
  }

  private toQueryRow(columns: string[], row: unknown[]): QueryRow {
    const result: QueryRow = {};
    for (let i = 0; i < columns.length; i++) {
      result[columns[i]] = row[i];
    }
    return result;
  }

  private shapeResponseToScope(
    aiResult: GenerateDataMartMetadataResponse,
    request: GenerateDataMartMetadataRequest
  ): GenerateDataMartMetadataResponse {
    const { scope, fieldName } = request;

    switch (scope) {
      case DataMartMetadataScope.TITLE:
        return { title: aiResult.title };
      case DataMartMetadataScope.DESCRIPTION:
        return { description: aiResult.description };
      case DataMartMetadataScope.FIELD_ALIAS: {
        const match = aiResult.fields?.find(f => f.name === fieldName);
        return { fields: match ? [{ name: match.name, alias: match.alias }] : [] };
      }
      case DataMartMetadataScope.FIELD_DESCRIPTION: {
        const match = aiResult.fields?.find(f => f.name === fieldName);
        return {
          fields: match ? [{ name: match.name, description: match.description }] : [],
        };
      }
      case DataMartMetadataScope.ALL_FIELD_ALIASES:
        return {
          fields: aiResult.fields?.map(f => ({ name: f.name, alias: f.alias })) ?? [],
        };
      case DataMartMetadataScope.ALL_FIELD_METADATA:
        return {
          fields:
            aiResult.fields?.map(f => ({
              name: f.name,
              alias: f.alias,
              description: f.description,
            })) ?? [],
        };
      case DataMartMetadataScope.ALL_FIELD_DESCRIPTIONS:
      default:
        return {
          fields: aiResult.fields?.map(f => ({ name: f.name, description: f.description })) ?? [],
        };
    }
  }
}
