import { DataMartInsightTemplateOutput } from '../data-mart-insights.types';
import { AgentTelemetry } from '../../../common/ai-insights/agent/types';

export interface ModelUsageTotals {
  model: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export function getTotalUsageFromResult(
  result: DataMartInsightTemplateOutput
): Record<string, ModelUsageTotals> {
  const totals: Record<string, ModelUsageTotals> = {};

  for (const p of result.prompts) {
    const telemetry = p.meta?.telemetry as AgentTelemetry | undefined;
    if (!telemetry?.llmCalls?.length) continue;

    for (const call of telemetry.llmCalls) {
      const model = call.model;
      const usage = call.usage;

      if (!model || !usage) continue;

      const promptTokens = usage.promptTokens ?? 0;
      const completionTokens = usage.completionTokens ?? 0;
      const totalTokens = usage.totalTokens ?? 0;

      if (!totals[model]) {
        totals[model] = {
          model,
          calls: 1,
          promptTokens,
          completionTokens,
          totalTokens,
        };
      } else {
        const entry = totals[model];
        entry.calls += 1;
        entry.promptTokens += promptTokens;
        entry.completionTokens += completionTokens;
        entry.totalTokens += totalTokens;
      }
    }
  }

  return totals;
}
