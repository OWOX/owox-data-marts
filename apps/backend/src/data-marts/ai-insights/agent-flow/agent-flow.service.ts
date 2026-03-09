import { Injectable, Logger } from '@nestjs/common';
import { AgentFlowAgent } from './agent-flow.agent';
import { AssistantOrchestratorResponse } from './ai-assistant-types';
import { AiContentFilterError } from '../../../common/ai-insights/services/error';
import { AgentFlowPromptContext, AgentFlowRequest } from './types';
import { createTelemetry } from './agent-telemetry.utils';
import { AgentFlowContentPolicyRestrictedError } from './agent-flow-policy-sanitizer.service';
import { resolveAgentFlowProposedActions } from './agent-flow-proposed-actions.utils';
import { castError } from '@owox/internal-helpers';

/**
 * AgentFlowService — public facade for the agent-flow approach.
 *
 * This is the entry point for the new LLM+tools based source assistant flow.
 * It runs the agent loop and translates the result back into a SourceOrchestratorResponse
 * so it is compatible with the existing API contract.
 */
@Injectable()
export class AgentFlowService {
  private readonly logger = new Logger(AgentFlowService.name);

  constructor(private readonly agent: AgentFlowAgent) {}

  async run(
    request: AgentFlowRequest,
    promptContext: AgentFlowPromptContext
  ): Promise<AssistantOrchestratorResponse> {
    const telemetry = createTelemetry();

    try {
      const { result, context } = await this.agent.run(request, telemetry, promptContext);

      const proposedActions = resolveAgentFlowProposedActions({
        resultProposedActions: result.proposedActions,
        templateEditIntent: result.templateEditIntent,
      });
      const lastGeneratedSql = context.lastGeneratedSql;
      const reasonDescription =
        context.lastGeneratedSqlReasonDescription ?? result.reasonDescription ?? result.explanation;
      const diagnostics = context.lastGeneratedSqlDiagnostics;

      this.logger.log('AiAssistantCompleted', { context, result });

      return {
        status: 'ok',
        decision: result.decision,
        explanation: result.explanation,
        proposedActions: proposedActions.length > 0 ? proposedActions : undefined,
        // Pass SQL to UI — it reads response.result.sqlCandidate to apply the action
        result: lastGeneratedSql
          ? {
              sqlCandidate: lastGeneratedSql,
              dryRun: { isValid: context.lastDryRunValid ?? false },
            }
          : undefined,
        meta: {
          sanitizedLastUserMessage: context.sanitizedLastUserMessage ?? null,
          reasonDescription,
          telemetry,
          ...(diagnostics ? { diagnostics } : {}),
        },
      };
    } catch (error: unknown) {
      if (
        error instanceof AgentFlowContentPolicyRestrictedError ||
        error instanceof AiContentFilterError
      ) {
        const sanitizedLastUserMessage =
          error instanceof AgentFlowContentPolicyRestrictedError
            ? error.sanitizedLastUserMessage
            : null;

        return {
          status: 'restricted',
          decision: 'clarify',
          explanation: 'This request cannot be processed due to content policy restrictions.',
          meta: {
            sanitizedLastUserMessage,
            reasonDescription: 'Blocked by AI content filter.',
            telemetry,
          },
        };
      }

      const e = castError(error);
      this.logger.error('AgentFlowService: error', { error: e.stack });

      return {
        status: 'error',
        decision: 'clarify',
        explanation: 'Unable to process this request right now.',
        meta: {
          sanitizedLastUserMessage: null,
          reasonDescription: e.message,
          telemetry,
        },
      };
    }
  }
}
