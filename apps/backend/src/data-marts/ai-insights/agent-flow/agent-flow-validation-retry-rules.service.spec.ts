import { AgentFlowValidationRetryRulesService } from './agent-flow-validation-retry-rules.service';
import { AgentFlowValidationContext } from './agent-flow-validation-retry.types';

describe('AgentFlowValidationRetryRulesService', () => {
  const createContext = (): AgentFlowValidationContext => ({
    result: {
      decision: 'edit_template',
      explanation: 'explanation',
      reasonDescription: 'reason',
      templateEditIntent: {
        type: 'replace_template_document',
        text: '# Report\n\n[[TAG:t1]]',
        tags: [{ id: 't1', name: 'table', params: { source: 'main' } }],
      },
      proposedActions: [
        {
          type: 'create_source_and_attach',
          id: 'act_1',
          confidence: 0.95,
          payload: {
            suggestedSourceKey: 'source_1',
          },
        },
      ],
    },
    resolvedProposedActions: [
      {
        type: 'create_source_and_attach',
        id: 'act_1',
        confidence: 0.95,
        payload: {
          suggestedSourceKey: 'source_1',
        },
      },
    ],
    stateSnapshot: {
      sessionId: 'session-1',
      templateId: 'template-1',
      sources: [],
      appliedActions: [],
      pendingActions: [],
      sqlRevisions: [],
    },
  });

  const createService = () => {
    const templateEditIntentValidator = {
      validate: jest.fn(),
      buildRetrySystemFeedback: jest.fn().mockReturnValue('template hint'),
    };
    const proposedActionsTemplateValidator = {
      validate: jest.fn(),
      buildRetrySystemFeedback: jest.fn().mockReturnValue('proposed actions hint'),
    };
    const createSourceKeyValidator = {
      validate: jest.fn(),
      buildRetrySystemFeedback: jest.fn().mockReturnValue('source key hint'),
    };

    const service = new AgentFlowValidationRetryRulesService(
      templateEditIntentValidator as never,
      proposedActionsTemplateValidator as never,
      createSourceKeyValidator as never
    );

    return {
      service,
      templateEditIntentValidator,
      proposedActionsTemplateValidator,
      createSourceKeyValidator,
    };
  };

  it('returns ordered rules with expected keys and retry limits', () => {
    const { service } = createService();
    const rules = service.getRules();

    expect(rules.map(rule => rule.key)).toEqual([
      'template_edit_intent',
      'proposed_action_template',
      'create_source_key',
    ]);
    expect(rules.map(rule => rule.maxRetries)).toEqual([2, 2, 2]);
  });

  it('template rule delegates validation and retry hint to validator service', () => {
    const { service, templateEditIntentValidator } = createService();
    const [templateRule] = service.getRules();
    const context = createContext();
    const validationError = {
      code: 'template_placeholder_unknown_id',
      message: 'invalid',
    };
    templateEditIntentValidator.validate.mockReturnValue({
      ok: false,
      error: validationError,
    });

    const validation = templateRule.validate(context);

    expect(validation).toEqual({ ok: false, error: validationError });
    const hint = templateRule.buildRetryHint({
      context,
      error: validationError,
    });
    expect(hint).toBe('template hint');
    expect(templateEditIntentValidator.buildRetrySystemFeedback).toHaveBeenCalledWith({
      templateEditIntent: context.result.templateEditIntent,
      error: validationError,
    });
  });

  it('proposed action template rule validates resolved proposed actions', () => {
    const { service, proposedActionsTemplateValidator } = createService();
    const [, proposedActionRule] = service.getRules();
    const context = createContext();
    const error = {
      actionId: 'act_1',
      actionType: 'create_source_and_attach',
      validationError: {
        code: 'template_tag_invalid_source',
        message: 'invalid source',
      },
    };
    proposedActionsTemplateValidator.validate.mockReturnValue({
      ok: false,
      error,
    });

    const validation = proposedActionRule.validate(context);

    expect(proposedActionsTemplateValidator.validate).toHaveBeenCalledWith({
      proposedActions: context.resolvedProposedActions,
      stateSnapshot: context.stateSnapshot,
    });
    expect(validation).toEqual({ ok: false, error });
  });

  it('create source key rule builds terminal error with retry count', () => {
    const { service } = createService();
    const [, , createSourceKeyRule] = service.getRules();
    const error = {
      code: 'create_source_key_not_unique',
      message: 'duplicate',
      actionId: 'act_1',
      suggestedSourceKey: 'source_1',
      conflictType: 'existing_source' as const,
      existingSourceKeys: ['source_1'],
    };

    const terminalError = createSourceKeyRule.toTerminalError({
      error,
      maxRetries: 2,
    });

    expect(terminalError.message).toContain('create_source_key_invalid_after_2_retries');
  });
});
