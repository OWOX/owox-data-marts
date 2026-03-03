import { Injectable } from '@nestjs/common';
import {
  AgentFlowValidationContext,
  AgentFlowValidationRetryEvaluationResult,
  AgentFlowValidationRetryRule,
  AgentFlowValidationRetryState,
} from './agent-flow-validation-retry.types';

@Injectable()
export class AgentFlowValidationRetryEngineService {
  evaluate(params: {
    rules: AgentFlowValidationRetryRule<unknown>[];
    context: AgentFlowValidationContext;
    state: AgentFlowValidationRetryState;
  }): AgentFlowValidationRetryEvaluationResult {
    const { rules, context, state } = params;

    for (const rule of rules) {
      if (rule.applies && !rule.applies(context)) {
        continue;
      }

      const validation = rule.validate(context);
      if (validation.ok) {
        continue;
      }

      const usedRetries = state.retryCountByRuleKey[rule.key] ?? 0;
      if (usedRetries >= rule.maxRetries) {
        throw rule.toTerminalError({
          error: validation.error,
          maxRetries: rule.maxRetries,
        });
      }

      const retry = usedRetries + 1;
      state.retryCountByRuleKey[rule.key] = retry;

      return {
        type: 'retry',
        ruleKey: rule.key,
        retry,
        feedback: rule.buildRetryHint({
          context,
          error: validation.error,
        }),
        logMessage: rule.retryLogMessage,
        logMeta: rule.buildRetryLogMeta?.(validation.error) ?? {},
      };
    }

    return { type: 'pass' };
  }
}
