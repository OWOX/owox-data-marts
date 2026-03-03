import type { AssistantProposedAction } from './ai-assistant-types';
import type { AgentFlowResult, AgentFlowStateSnapshot } from './types';

export interface AgentFlowValidationContext {
  result: AgentFlowResult;
  resolvedProposedActions: AssistantProposedAction[];
  stateSnapshot: AgentFlowStateSnapshot;
}

export type AgentFlowRuleValidationResult<TError> = { ok: true } | { ok: false; error: TError };

export interface AgentFlowValidationRetryRule<TError = unknown> {
  key: string;
  maxRetries: number;
  retryLogMessage: string;
  applies?: (context: AgentFlowValidationContext) => boolean;
  validate: (context: AgentFlowValidationContext) => AgentFlowRuleValidationResult<TError>;
  buildRetryHint: (params: { context: AgentFlowValidationContext; error: TError }) => string;
  toTerminalError: (params: { error: TError; maxRetries: number }) => Error;
  buildRetryLogMeta?: (error: TError) => Record<string, unknown>;
}

export interface AgentFlowValidationRetryState {
  retryCountByRuleKey: Record<string, number>;
}

export function createAgentFlowValidationRetryState(): AgentFlowValidationRetryState {
  return {
    retryCountByRuleKey: {},
  };
}

export type AgentFlowValidationRetryEvaluationResult =
  | {
      type: 'pass';
    }
  | {
      type: 'retry';
      ruleKey: string;
      retry: number;
      feedback: string;
      logMessage: string;
      logMeta: Record<string, unknown>;
    };
