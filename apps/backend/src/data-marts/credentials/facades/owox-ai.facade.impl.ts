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
    return new ReadableStream<unknown>(
      {
        pull: async controller => {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            return;
          }
          const part = value as StreamPart;
          if (part.type === 'finish' && part.finishReason?.unified !== 'error') {
            this.record(context, languageTokens(part.usage));
          }
          controller.enqueue(part.type === 'response-metadata' ? withoutModelNames(part) : value);
        },
        cancel: reason => reader.cancel(reason),
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

/** Plugin code must not learn which model or provider generation answered. */
function withoutModelNames(part: StreamPart): StreamPart {
  const {
    id: _id,
    modelId: _modelId,
    ...rest
  } = part as StreamPart & {
    id?: unknown;
    modelId?: unknown;
  };
  return rest;
}

function languageTokens(usage: LanguageUsage | undefined): number {
  return (usage?.inputTokens?.total ?? 0) + (usage?.outputTokens?.total ?? 0);
}
