import { Injectable } from '@nestjs/common';
import type { AssistantProposedAction } from './ai-assistant-types';
import type { AgentFlowStateSnapshot } from './types';
import type { TemplatePlaceholderTagValidationError } from '../../services/template-edit-placeholder-tags/template-edit-placeholder-tags-validation.types';
import { TemplatePlaceholderTagsRendererService } from '../../services/template-edit-placeholder-tags/template-placeholder-tags-renderer.service';
import { normalizeString } from '../../../common/helpers/normalize-string.helper';
import { AgentFlowTemplateValidationFeedbackService } from './agent-flow-template-validation-feedback.service';

export interface ProposedActionTemplateValidationError {
  actionId: string;
  actionType: AssistantProposedAction['type'];
  validationError: TemplatePlaceholderTagValidationError;
}

export class AgentFlowProposedActionsTemplateInvalidError extends Error {
  constructor(
    public readonly validationError: ProposedActionTemplateValidationError,
    public readonly retryAttempts: number
  ) {
    super(
      `proposed_action_template_invalid_after_${retryAttempts}_retries:` +
        `${validationError.actionId}:${validationError.validationError.code}`
    );
  }
}

export type ProposedActionsTemplateValidationResult =
  | { ok: true }
  | { ok: false; error: ProposedActionTemplateValidationError };

@Injectable()
export class AgentFlowProposedActionsTemplateValidatorService {
  constructor(
    private readonly templatePlaceholderTagsRenderer: TemplatePlaceholderTagsRendererService,
    private readonly templateValidationFeedback: AgentFlowTemplateValidationFeedbackService
  ) {}

  validate(params: {
    proposedActions: AssistantProposedAction[] | undefined;
    stateSnapshot: AgentFlowStateSnapshot;
  }): ProposedActionsTemplateValidationResult {
    const proposedActions = params.proposedActions ?? [];
    const availableSourceKeys = this.collectAvailableSourceKeys(
      params.stateSnapshot,
      proposedActions
    );

    for (const action of proposedActions) {
      const payload = this.extractTemplatePayload(action);
      if (!payload) {
        continue;
      }

      const renderResult = this.templatePlaceholderTagsRenderer.render({
        text: payload.text,
        tags: payload.tags,
        tagValidationOptions: {
          availableSourceKeys,
          allowMainSource: true,
        },
      });

      if (!renderResult.ok) {
        return {
          ok: false,
          error: {
            actionId: action.id,
            actionType: action.type,
            validationError: renderResult.error,
          },
        };
      }
    }

    return { ok: true };
  }

  buildRetrySystemFeedback(params: {
    proposedActions: AssistantProposedAction[] | undefined;
    error: ProposedActionTemplateValidationError;
  }): string {
    const { proposedActions, error } = params;
    const validationLine = this.templateValidationFeedback.formatValidationLine(
      error.validationError
    );
    const fixHint = this.templateValidationFeedback.buildFixHint(error.validationError);

    return (
      'Your previous response had invalid `proposedActions` template payload and cannot be applied.\n' +
      `${validationLine}\n` +
      `Invalid action: id="${error.actionId}", type="${error.actionType}"\n` +
      `How to fix: ${fixHint}\n` +
      'Return the full JSON response again (same schema), with corrected `proposedActions` payload.\n' +
      'Do not change unrelated fields unless needed for consistency.\n' +
      `Previous invalid proposedActions: ${JSON.stringify(proposedActions ?? [])}`
    );
  }

  private extractTemplatePayload(action: AssistantProposedAction): {
    text: string;
    tags: Array<{ id: string; name: 'table' | 'value'; params: Record<string, unknown> }>;
  } | null {
    const payload = action.payload as Record<string, unknown>;
    if (typeof payload.text === 'string' && Array.isArray(payload.tags)) {
      return {
        text: payload.text,
        tags: payload.tags as Array<{
          id: string;
          name: 'table' | 'value';
          params: Record<string, unknown>;
        }>,
      };
    }

    return null;
  }

  private collectAvailableSourceKeys(
    stateSnapshot: AgentFlowStateSnapshot,
    proposedActions: AssistantProposedAction[]
  ): string[] {
    const sourceKeys = new Set<string>();

    for (const source of stateSnapshot.sources) {
      const normalized = normalizeString(source.sourceKey);
      if (normalized) {
        sourceKeys.add(normalized);
      }
    }

    for (const action of proposedActions) {
      if (
        action.type === 'create_source_and_attach' ||
        action.type === 'attach_source_to_template'
      ) {
        const normalized = normalizeString(action.payload.suggestedSourceKey);
        if (normalized) {
          sourceKeys.add(normalized);
        }
        continue;
      }

      if (
        action.type === 'apply_changes_to_source' ||
        action.type === 'reuse_source_without_changes'
      ) {
        const normalized = normalizeString(action.payload.sourceKey);
        if (normalized) {
          sourceKeys.add(normalized);
        }
      }
    }

    return [...sourceKeys];
  }
}
