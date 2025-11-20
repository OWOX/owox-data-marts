import { ToolRegistryService } from '../agent/tool-registry.service';

export const AI_INSIGHTS_TOOLS_REGISTRARS = Symbol('AI_INSIGHTS_TOOLS_REGISTRARS');

/**
 * Registrar contract for LLM-callable tools used by the AI Insights agent.
 */
export interface AiInsightsToolsRegistrar {
  registerTools(registry: ToolRegistryService): void;
}
