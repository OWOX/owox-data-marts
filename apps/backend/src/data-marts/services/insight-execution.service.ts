import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OwoxProducer } from '@owox/internal-helpers';
import { Repository } from 'typeorm';
import { AgentTelemetry } from '../../common/ai-insights/agent/types';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { OWOX_PRODUCER } from '../../common/producer/producer.module';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
import { RunType } from '../../common/scheduler/shared/types';
import { DataMartInsightTemplateFacadeImpl } from '../ai-insights/data-mart-insight-template.facade';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMart } from '../entities/data-mart.entity';
import { Insight } from '../entities/insight.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { InsightRunSuccessfullyEvent } from '../events/insight-run-successfully.event';
import { DataMartRunService } from './data-mart-run.service';

@Injectable()
export class InsightExecutionService {
  private readonly logger = new Logger(InsightExecutionService.name);

  /**
   * Summarize agent telemetry for logging purposes (without model names).
   * Returns compact, privacy-aware metrics suitable for persistence in run logs.
   *
   * @param telemetry Agent telemetry collected during the AI Insight run.
   * @returns A summary containing counts, failure stats, last usage and tools used.
   */
  private summarizeAgentTelemetry(telemetry: AgentTelemetry): {
    llmCalls: number;
    toolCalls: number;
    failedToolCalls: number;
    lastFinishReason?: string;
    lastUsage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
  } {
    const llmCalls = telemetry.llmCalls ?? [];
    const toolCalls = telemetry.toolCalls ?? [];
    const failedToolCalls = toolCalls.filter(call => !call.success).length;
    const lastLlm = llmCalls.length ? llmCalls[llmCalls.length - 1] : undefined;
    return {
      llmCalls: llmCalls.length,
      toolCalls: toolCalls.length,
      failedToolCalls,
      lastFinishReason: lastLlm?.finishReason,
      lastUsage: lastLlm?.usage,
    };
  }

  constructor(
    private readonly dataMartRunService: DataMartRunService,
    @InjectRepository(Insight)
    private readonly insightRepository: Repository<Insight>,
    private readonly systemTimeService: SystemTimeService,
    @Inject(OWOX_PRODUCER)
    private readonly producer: OwoxProducer,
    private readonly insightTemplateFacade: DataMartInsightTemplateFacadeImpl
  ) {}

  async run(
    dataMart: DataMart,
    insight: Insight,
    createdById: string,
    runType: RunType
  ): Promise<string> {
    this.validateDataMartForInsight(dataMart);
    const isRunning = await this.dataMartRunService.isInsightRunning(insight.id);
    if (isRunning) {
      throw new BusinessViolationException(
        'Insight is already running. Please wait until it finishes'
      );
    }

    const dataMartRun = await this.createRun(dataMart, insight, createdById, runType);

    await this.insightRepository.update(insight.id, {
      lastManualDataMartRunId: dataMartRun.id,
      output: '',
      outputUpdatedAt: this.systemTimeService.now(),
    });

    await this.execute(dataMart, insight, dataMartRun).catch(error => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Insight execution failed: ${errorMessage}`, error?.stack, {
        dataMartId: dataMart.id,
        projectId: dataMart.projectId,
        runId: dataMartRun.id,
        userId: createdById,
      });
    });

    return dataMartRun.id;
  }

  private validateDataMartForInsight(dataMart: DataMart): void {
    if (dataMart.status !== DataMartStatus.PUBLISHED) {
      throw new BusinessViolationException('DataMart is not published');
    }
  }

  private async createRun(
    dataMart: DataMart,
    insight: Insight,
    createdById: string,
    runType: RunType
  ): Promise<DataMartRun> {
    return this.dataMartRunService.createAndMarkInsightRunAsPending(dataMart, insight, {
      createdById,
      runType,
    });
  }

  /**
   * Execute the AI Insight:
   * - Render template via AI Insights layer (with {{prompt}} tag handler)
   * - Log prompt meta and compact telemetry
   * - Persist final output and run status
   */
  private async execute(dataMart: DataMart, insight: Insight, run: DataMartRun) {
    const runId = run.id;
    await this.dataMartRunService.markInsightRunAsStarted(run);

    const logs: string[] = [];
    const errors: string[] = [];
    let generatedOutput: string | null = null;

    const pushLog = (message: Record<string, unknown>) => {
      const enriched = {
        at: this.systemTimeService.now(),
        ...message,
      };
      logs.push(JSON.stringify(enriched));
    };

    const runMain = async (): Promise<string> => {
      pushLog({ type: 'log', message: 'AI Insight started' });
      const template = insight.template ?? '';
      const { rendered, prompts } = await this.insightTemplateFacade.render({
        template,
        params: {
          projectId: dataMart.projectId,
          dataMartId: dataMart.id,
        },
      });
      for (const p of prompts ?? []) {
        // Basic meta about prompt/artifact
        pushLog({
          type: 'ai_insight_meta',
          prompt: p.payload?.prompt,
          artifact: p.meta?.artifact,
        });

        // Agent telemetry (LLM/Tool calls), if available
        const telemetry = (p.meta as { telemetry?: AgentTelemetry } | undefined)?.telemetry;
        if (telemetry) {
          const summary = this.summarizeAgentTelemetry(telemetry);
          pushLog({ type: 'ai_insight_telemetry', ...summary });
          const lastLlm = telemetry.llmCalls.length
            ? telemetry.llmCalls[telemetry.llmCalls.length - 1]
            : undefined;
          const preview = lastLlm?.reasoningPreview;
          if (typeof preview === 'string' && preview.length > 0) {
            pushLog({
              type: 'ai_insight_reasoning_preview',
              preview: preview.slice(0, 500),
            });
          }
        }
      }

      // Overall rendered insight output
      if (rendered && rendered.length > 0) {
        pushLog({
          type: 'ai_insight_output',
          output: rendered,
        });
      }
      pushLog({ type: 'log', message: 'AI Insight completed' });
      return rendered ?? '';
    };

    try {
      generatedOutput = await runMain();

      await this.dataMartRunService.markInsightRunAsFinished(run, {
        status: DataMartRunStatus.SUCCESS,
        logs,
        errors,
      });

      await this.producer.produceEvent(
        new InsightRunSuccessfullyEvent(
          dataMart.id,
          runId,
          dataMart.projectId,
          run.createdById!,
          run.runType!
        )
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push(
        JSON.stringify({
          type: 'error',
          at: this.systemTimeService.now(),
          error: message,
        })
      );
      await this.dataMartRunService.markInsightRunAsFinished(run, {
        status: DataMartRunStatus.FAILED,
        logs,
        errors,
      });
      this.logger.error(`Insight run failed: ${message}`, (e as Error)?.stack, {
        dataMartId: dataMart.id,
        projectId: dataMart.projectId,
        runId,
        userId: run.createdById,
      });
    } finally {
      const updatePayload: Record<string, unknown> = {
        lastManualDataMartRunId: run.id,
      };
      if (generatedOutput !== null) {
        updatePayload.output = generatedOutput;
        updatePayload.outputUpdatedAt = this.systemTimeService.now();
      }
      await this.insightRepository.update(insight.id, updatePayload);
    }
  }
}
