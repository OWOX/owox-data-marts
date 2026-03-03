import { Injectable } from '@nestjs/common';
import {
  AgentFlowCreateSourceKeyInvalidError,
  AgentFlowCreateSourceKeyValidatorService,
  CreateSourceKeyValidationError,
} from './agent-flow-create-source-key-validator.service';
import {
  AgentFlowProposedActionsTemplateInvalidError,
  AgentFlowProposedActionsTemplateValidatorService,
  ProposedActionTemplateValidationError,
} from './agent-flow-proposed-actions-template-validator.service';
import {
  AgentFlowTemplateEditIntentInvalidError,
  AgentFlowTemplateEditIntentValidatorService,
} from './agent-flow-template-edit-intent-validator.service';
import {
  AgentFlowValidationRetryRule,
  AgentFlowValidationContext,
} from './agent-flow-validation-retry.types';
import type { TemplatePlaceholderTagValidationError } from '../../services/template-edit-placeholder-tags/template-edit-placeholder-tags-validation.types';

const TEMPLATE_EDIT_INTENT_RETRY_ATTEMPTS = 2;
const PROPOSED_ACTION_TEMPLATE_RETRY_ATTEMPTS = 2;
const CREATE_SOURCE_KEY_RETRY_ATTEMPTS = 2;

@Injectable()
export class AgentFlowValidationRetryRulesService {
  constructor(
    private readonly templateEditIntentValidator: AgentFlowTemplateEditIntentValidatorService,
    private readonly proposedActionsTemplateValidator: AgentFlowProposedActionsTemplateValidatorService,
    private readonly createSourceKeyValidator: AgentFlowCreateSourceKeyValidatorService
  ) {}

  getRules(): AgentFlowValidationRetryRule<unknown>[] {
    return [
      this.buildTemplateEditIntentRule(),
      this.buildProposedActionTemplateRule(),
      this.buildCreateSourceKeyRule(),
    ];
  }

  private buildTemplateEditIntentRule(): AgentFlowValidationRetryRule<TemplatePlaceholderTagValidationError> {
    return {
      key: 'template_edit_intent',
      maxRetries: TEMPLATE_EDIT_INTENT_RETRY_ATTEMPTS,
      retryLogMessage: 'AgentFlowAgent: templateEditIntent invalid, retrying response',
      validate: (context: AgentFlowValidationContext) =>
        this.templateEditIntentValidator.validate(context.result.templateEditIntent),
      buildRetryHint: ({ context, error }) => {
        const templateEditIntent = context.result.templateEditIntent;
        if (!templateEditIntent) {
          return (
            'Your previous response had an invalid `templateEditIntent` and cannot be applied.\n' +
            `Validation error: [${error.code}] ${error.message}\n` +
            'Return the full JSON response again (same schema), with corrected `templateEditIntent`.'
          );
        }

        return this.templateEditIntentValidator.buildRetrySystemFeedback({
          templateEditIntent,
          error,
        });
      },
      toTerminalError: ({ error, maxRetries }) =>
        new AgentFlowTemplateEditIntentInvalidError(error, maxRetries),
      buildRetryLogMeta: error => ({
        code: error.code,
        message: error.message,
      }),
    };
  }

  private buildProposedActionTemplateRule(): AgentFlowValidationRetryRule<ProposedActionTemplateValidationError> {
    return {
      key: 'proposed_action_template',
      maxRetries: PROPOSED_ACTION_TEMPLATE_RETRY_ATTEMPTS,
      retryLogMessage:
        'AgentFlowAgent: proposed action template payload invalid, retrying response',
      validate: context =>
        this.proposedActionsTemplateValidator.validate({
          proposedActions: context.resolvedProposedActions,
          stateSnapshot: context.stateSnapshot,
        }),
      buildRetryHint: ({ context, error }) =>
        this.proposedActionsTemplateValidator.buildRetrySystemFeedback({
          proposedActions: context.resolvedProposedActions,
          error,
        }),
      toTerminalError: ({ error, maxRetries }) =>
        new AgentFlowProposedActionsTemplateInvalidError(error, maxRetries),
      buildRetryLogMeta: error => ({
        code: error.validationError.code,
        actionId: error.actionId,
        actionType: error.actionType,
      }),
    };
  }

  private buildCreateSourceKeyRule(): AgentFlowValidationRetryRule<CreateSourceKeyValidationError> {
    return {
      key: 'create_source_key',
      maxRetries: CREATE_SOURCE_KEY_RETRY_ATTEMPTS,
      retryLogMessage: 'AgentFlowAgent: create source key collision, retrying response',
      validate: context =>
        this.createSourceKeyValidator.validate({
          proposedActions: context.resolvedProposedActions,
          stateSnapshot: context.stateSnapshot,
        }),
      buildRetryHint: ({ context, error }) =>
        this.createSourceKeyValidator.buildRetrySystemFeedback({
          proposedActions: context.resolvedProposedActions,
          error,
        }),
      toTerminalError: ({ error, maxRetries }) =>
        new AgentFlowCreateSourceKeyInvalidError(error, maxRetries),
      buildRetryLogMeta: error => ({
        code: error.code,
        suggestedSourceKey: error.suggestedSourceKey,
        actionId: error.actionId,
      }),
    };
  }
}
