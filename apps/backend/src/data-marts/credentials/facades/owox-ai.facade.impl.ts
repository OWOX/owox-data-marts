import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ProjectOperationBlockedException } from '../../../common/exceptions/project-operation-blocked.exception';
import {
  type PluginAiConsumptionContext,
  ProjectBillingService,
  RunKind,
} from '../../services/project-billing/project-billing.service';
import type { CredentialAiLanguageModelKey } from '../dto/credential-ai-api.dto';
import { CredentialAiService } from '../services/credential-ai.service';
import { type OwoxAiModelKey, OwoxAiModelService } from '../services/owox-ai-model.service';
import type { OwoxAiFacade, OwoxAiStatus } from './owox-ai.facade';

interface LanguageUsage {
  readonly inputTokens?: { readonly total?: number };
  readonly outputTokens?: { readonly total?: number };
}

interface StreamPart {
  readonly type?: string;
  readonly usage?: LanguageUsage;
  readonly finishReason?: { readonly unified?: string };
}

@Injectable()
export class OwoxAiFacadeImpl implements OwoxAiFacade {
  private readonly logger = new Logger(OwoxAiFacadeImpl.name);

  constructor(
    private readonly owoxAiModels: OwoxAiModelService,
    private readonly ai: CredentialAiService,
    private readonly billing: ProjectBillingService
  ) {}

  status(): OwoxAiStatus {
    return {
      models: this.owoxAiModels.models(),
      billed: this.billing.consumesBalance(),
    };
  }

  provides(models: readonly string[]): boolean {
    const available: readonly string[] = this.owoxAiModels.models();
    return available.length > 0 && models.every(model => available.includes(model));
  }

  async generate(
    context: PluginAiConsumptionContext,
    model: CredentialAiLanguageModelKey,
    portableOptions: unknown,
    signal: AbortSignal
  ): Promise<unknown> {
    await this.authorize(context, model);
    const result = await this.ai.generateWith(
      this.owoxAiModels.languageModel(model, signal),
      portableOptions,
      signal,
      this.owoxAiModels.failureLog(model)
    );
    this.record(context, languageTokens((result as { usage?: LanguageUsage }).usage));
    return result;
  }

  async stream(
    context: PluginAiConsumptionContext,
    model: CredentialAiLanguageModelKey,
    portableOptions: unknown,
    signal: AbortSignal
  ): Promise<ReadableStream<unknown>> {
    await this.authorize(context, model);
    const source = await this.ai.streamWith(
      this.owoxAiModels.languageModel(model, signal),
      portableOptions,
      signal,
      this.owoxAiModels.failureLog(model)
    );
    const reader = source.getReader();
    let parts = 0;
    let finished = false;
    // A stream stopped before its finish part is not billed, so the log shows how often that happens.
    const warnUnbilled = () => {
      if (finished) return;
      finished = true;
      this.logger.warn(
        `OWOX AI stream stopped before its finish part and is not billed: plugin ${context.pluginId}, project ${context.projectId}, model ${model}, parts sent ${parts}`
      );
    };
    return new ReadableStream<unknown>(
      {
        pull: async controller => {
          let read: ReadableStreamReadResult<unknown>;
          try {
            read = await reader.read();
          } catch (error) {
            if (signal.aborted) warnUnbilled();
            throw error;
          }
          if (read.done) {
            controller.close();
            return;
          }
          const part = read.value as StreamPart;
          parts++;
          if (part.type === 'finish') {
            finished = true;
            if (part.finishReason?.unified !== 'error') {
              this.record(context, languageTokens(part.usage));
            }
          }
          controller.enqueue(read.value);
        },
        cancel: reason => {
          warnUnbilled();
          return reader.cancel(reason);
        },
      },
      // Read the source only when the caller reads, so a cancel before the finish part records nothing.
      { highWaterMark: 0 }
    );
  }

  async embed(
    context: PluginAiConsumptionContext,
    portableOptions: unknown,
    signal: AbortSignal
  ): Promise<unknown> {
    await this.authorize(context, 'embedding');
    const result = await this.ai.embedWith(
      this.owoxAiModels.embeddingModel(signal),
      portableOptions,
      signal,
      this.owoxAiModels.failureLog('embedding')
    );
    this.record(context, (result as { usage?: { tokens?: number } }).usage?.tokens ?? 0);
    return result;
  }

  async decide(
    context: PluginAiConsumptionContext,
    portableOptions: unknown,
    signal: AbortSignal
  ): Promise<unknown> {
    await this.authorize(context, 'decision');
    const result = await this.ai.decideWith(
      this.owoxAiModels.decisionModel(signal),
      portableOptions,
      signal,
      this.owoxAiModels.failureLog('decision')
    );
    const usage = (result as { usage?: { inputTokens?: number; outputTokens?: number } }).usage;
    this.record(context, (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0));
    return result;
  }

  /** Runs before the provider call, outside the AI error normalization that changes errors to 502. */
  private async authorize(
    context: PluginAiConsumptionContext,
    model: OwoxAiModelKey
  ): Promise<void> {
    if (!this.provides([model])) {
      // The same words for any AI route, so a plugin cannot tell OWOX AI from a Credential.
      throw new NotFoundException(`AI model ${model} is not available`);
    }
    try {
      await this.billing.verifyCanPerformOperations(context.projectId, RunKind.AI_PROCESS_RUN);
    } catch (error) {
      if (!(error instanceof ProjectOperationBlockedException)) throw error;
      throw new ForbiddenException({
        code: 'PROJECT_OPERATION_BLOCKED',
        message: error.message,
        errorDetails: error.errorDetails,
      });
    }
  }

  private record(context: PluginAiConsumptionContext, tokensProcessed: number): void {
    void this.billing
      .registerPluginAiProcessRunConsumption(tokensProcessed, context)
      .catch(error => this.logger.error('Failed to register consumption:', error));
  }
}

function languageTokens(usage: LanguageUsage | undefined): number {
  return (usage?.inputTokens?.total ?? 0) + (usage?.outputTokens?.total ?? 0);
}
