import { Inject, Injectable, Logger } from '@nestjs/common';
import { AiInsightsFacade } from './ai-insights.facade';

import {
  AnswerPromptRequest,
  AnswerPromptResponse,
  DataMartMetadataScope,
  GenerateDataMartMetadataRequest,
  GenerateDataMartMetadataResponse,
  GenerateInsightRequest,
  GenerateInsightResponse,
  QueryRow,
  SharedAgentContext,
} from '../ai-insights-types';
import { AiInsightsOrchestratorService } from '../ai-insight-orchestrator.service';
import {
  ConsumptionContext,
  DataMartPromptMetaEntry,
  PromptAnswer,
} from '../data-mart-insights.types';
import { GenerateInsightAgent } from '../agent/generate-insight.agent';
import { GenerateDataMartMetadataAgent } from '../agent/generate-data-mart-metadata.agent';
import { AI_CHAT_PROVIDER } from '../../../common/ai-insights/services/ai-chat-provider.token';
import { AiChatProvider } from '../../../common/ai-insights/agent/ai-core';
import { ToolRegistry } from '../../../common/ai-insights/agent/tool-registry';
import { AiContentFilterError } from '../../../common/ai-insights/services/error';
import { castError } from '@owox/internal-helpers';
import {
  measureExecutionTime,
  toMeasuredExecutionBaseResult,
} from '../../../common/utils/measure-execution-time';
import { DataMartService } from '../../services/data-mart.service';
import { DataMartSqlTableService } from '../../services/data-mart-sql-table.service';
import { DataMartDefinitionValidatorFacade } from '../../data-storage-types/facades/data-mart-definition-validator-facade.service';
import { ConsumptionTrackingService } from '../../services/consumption-tracking.service';
import { DataMartDefinitionType } from '../../enums/data-mart-definition-type.enum';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { getPromptTotalUsage } from '../utils/compute-model-usage';

const METADATA_SAMPLE_ROW_LIMIT = 30;

@Injectable()
export class AiInsightsFacadeImpl implements AiInsightsFacade {
  private readonly logger = new Logger(AiInsightsFacadeImpl.name);

  constructor(
    private readonly aiInsightsAgentService: AiInsightsOrchestratorService,
    private readonly generateInsightAgent: GenerateInsightAgent,
    private readonly generateDataMartMetadataAgent: GenerateDataMartMetadataAgent,
    private readonly dataMartService: DataMartService,
    private readonly dataMartSqlTableService: DataMartSqlTableService,
    private readonly definitionValidatorFacade: DataMartDefinitionValidatorFacade,
    private readonly consumptionTracker: ConsumptionTrackingService,
    @Inject(AI_CHAT_PROVIDER)
    private readonly aiProvider: AiChatProvider,
    private readonly toolRegistry: ToolRegistry
  ) {}

  async answerPrompt(request: AnswerPromptRequest): Promise<AnswerPromptResponse> {
    try {
      const measured = await measureExecutionTime(
        () => this.aiInsightsAgentService.answerPrompt(request),
        {
          onMeasured: measuredExecution => {
            this.logger.log('AiInsightsAnswerPromptTime', {
              projectId: request.projectId,
              dataMartId: request.dataMartId,
              measure: toMeasuredExecutionBaseResult(measuredExecution),
            });
          },
        }
      );

      return measured.result;
    } catch (e: unknown) {
      this.logger.error(`Unhandled error when processing prompt`, e, {
        projectId: request.projectId,
        dataMartId: request.dataMartId,
        prompt: request.prompt,
      });

      return {
        status: PromptAnswer.ERROR,
        meta: {
          prompt: request.prompt,
          sanitizedPrompt: null,
          reasonDescription: this.computeReasonDescription(castError(e)),
          telemetry: {
            llmCalls: [],
            toolCalls: [],
            messageHistory: [],
          },
        },
      };
    }
  }

  private computeReasonDescription(e: Error) {
    return e instanceof AiContentFilterError
      ? 'AI content filter error'
      : 'Something went wrong while processing the prompt. Try again later or contact us.';
  }

  async generateInsight(request: GenerateInsightRequest): Promise<GenerateInsightResponse> {
    this.logger.log(`Generating insight for data mart ${request.dataMartId}`);

    try {
      // Build shared context for the agent
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

      // Call the AI agent to generate insight title and template
      const aiResult = await this.generateInsightAgent.run(
        {
          dataMartTitle: request.dataMartTitle,
          dataMartDescription: request.dataMartDescription,
          schema: request.schema,
        },
        sharedContext
      );

      this.logger.log(`AI generated insight title: "${aiResult.title}"`);

      const prompts: DataMartPromptMetaEntry[] = [
        {
          payload: {
            projectId: request.projectId,
            dataMartId: request.dataMartId,
            prompt: 'generate insight',
          },
          promptAnswer: JSON.stringify(aiResult),
          meta: {
            prompt: 'generate insight',
            sanitizedPrompt: null,
            status: PromptAnswer.OK,
            telemetry: sharedContext.telemetry,
          },
        },
      ];

      return {
        title: aiResult.title,
        template: aiResult.template,
        prompts,
      };
    } catch (e: unknown) {
      this.logger.error(`Error generating insight for data mart ${request.dataMartId}`, e);
      throw e;
    }
  }

  async generateDataMartMetadata(
    request: GenerateDataMartMetadataRequest
  ): Promise<GenerateDataMartMetadataResponse> {
    this.logger.log(
      `Generating data mart metadata for ${request.dataMartId} (scope=${request.scope}, useSample=${request.useSample})`
    );

    const dataMart = await this.dataMartService.getByIdAndProjectId(
      request.dataMartId,
      request.projectId
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
      const sample = await this.dataMartSqlTableService.executeSqlToTable(dataMart, undefined, {
        limit: METADATA_SAMPLE_ROW_LIMIT,
      });
      sampleColumns = sample.columns;
      sampleRows = sample.rows.map(row => this.toQueryRow(sample.columns, row));
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

    const measured = await measureExecutionTime(
      () =>
        this.generateDataMartMetadataAgent.run(
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
        ),
      {
        onMeasured: measuredExecution => {
          this.logger.log('AiGenerateDataMartMetadataTime', {
            projectId: request.projectId,
            dataMartId: request.dataMartId,
            scope: request.scope,
            measure: toMeasuredExecutionBaseResult(measuredExecution),
          });
        },
      }
    );

    const aiResult = measured.result;

    const consumptionContext: ConsumptionContext = {
      contextType: 'DATA_MART_HELPER',
      contextId: dataMart.id,
      contextTitle: dataMart.title,
      dataMart,
    };
    try {
      const totalTokens = getPromptTotalUsage(sharedContext.telemetry.llmCalls).totalTokens;
      void this.consumptionTracker.registerAiProcessRunConsumption(totalTokens, consumptionContext);
    } catch (error) {
      this.logger.error('Failed to register AI metadata helper consumption', error);
    }

    return this.shapeResponseToScope(aiResult, request);
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
      case DataMartMetadataScope.ALL_FIELD_DESCRIPTIONS:
      default:
        return {
          fields: aiResult.fields?.map(f => ({ name: f.name, description: f.description })) ?? [],
        };
    }
  }
}
