import type { PluginAiConsumptionContext } from '../../services/project-billing/project-billing.service';
import type { CredentialAiLanguageModelKey } from '../dto/credential-ai-api.dto';
import type { OwoxAiModelKey } from '../services/owox-ai-model.service';

export const OWOX_AI_FACADE = Symbol('OWOX_AI_FACADE');

/** The value of `credentialSelections.ai` that selects OWOX AI in place of a Credential. */
export const OWOX_AI_SELECTION = 'owox-ai';

export interface OwoxAiStatus {
  readonly models: readonly OwoxAiModelKey[];
  /** True when the project balance pays for the AI Process Runs. */
  readonly billed: boolean;
}

/** The AI provider of the deployment, for plugins. */
export interface OwoxAiFacade {
  status(): OwoxAiStatus;
  /** True only when OWOX AI is on and provides every model in the list. */
  provides(models: readonly string[]): boolean;
  generate(
    context: PluginAiConsumptionContext,
    model: CredentialAiLanguageModelKey,
    portableOptions: unknown,
    signal: AbortSignal
  ): Promise<unknown>;
  stream(
    context: PluginAiConsumptionContext,
    model: CredentialAiLanguageModelKey,
    portableOptions: unknown,
    signal: AbortSignal
  ): Promise<ReadableStream<unknown>>;
  embed(
    context: PluginAiConsumptionContext,
    portableOptions: unknown,
    signal: AbortSignal
  ): Promise<unknown>;
  decide(
    context: PluginAiConsumptionContext,
    portableOptions: unknown,
    signal: AbortSignal
  ): Promise<unknown>;
}
