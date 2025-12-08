import { LlmCallTelemetry } from '../../../common/ai-insights/agent/types';
import { DataMartPromptMetaEntry } from '../data-mart-insights.types';

export interface ModelUsageTotals {
  executionTime: number;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export function getTemplateTotalUsage(promptsEntry: DataMartPromptMetaEntry[]): ModelUsageTotals {
  const templateTotalUsage: ModelUsageTotals = {
    executionTime: 0,
    calls: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };
  for (const promptEntry of promptsEntry) {
    const promptTotalUsage = getPromptTotalUsage(promptEntry.meta.telemetry.llmCalls);

    templateTotalUsage.executionTime += promptTotalUsage.executionTime;
    templateTotalUsage.calls += promptTotalUsage.calls;
    templateTotalUsage.promptTokens += promptTotalUsage.promptTokens;
    templateTotalUsage.completionTokens += promptTotalUsage.completionTokens;
    templateTotalUsage.totalTokens += promptTotalUsage.totalTokens;
  }

  return templateTotalUsage;
}

export function getPromptTotalUsage(llmCallTelemetry: LlmCallTelemetry[]): ModelUsageTotals {
  const totals: ModelUsageTotals = {
    executionTime: 0,
    calls: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  for (const call of llmCallTelemetry) {
    const usage = call.usage;

    if (!usage) continue;

    const executionTime = usage.executionTime ?? 0;
    const promptTokens = usage.promptTokens ?? 0;
    const completionTokens = usage.completionTokens ?? 0;
    const totalTokens = usage.totalTokens ?? 0;

    totals.executionTime += executionTime;
    totals.calls += 1;
    totals.promptTokens += promptTokens;
    totals.completionTokens += completionTokens;
    totals.totalTokens += totalTokens;
  }

  return totals;
}
