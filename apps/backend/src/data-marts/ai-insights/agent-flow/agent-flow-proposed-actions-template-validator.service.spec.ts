import { AgentFlowProposedActionsTemplateValidatorService } from './agent-flow-proposed-actions-template-validator.service';

describe('AgentFlowProposedActionsTemplateValidatorService', () => {
  const createStateSnapshot = (sourceKeys: string[]) => ({
    sessionId: 'session-1',
    templateId: 'template-1',
    sources: sourceKeys.map(sourceKey => ({
      sourceKey,
      artifactId: null,
      artifactTitle: null,
      isAttachedToTemplate: true,
      sqlHash: null,
      sqlPreview: null,
      updatedAt: null,
    })),
    appliedActions: [],
    pendingActions: [],
    sqlRevisions: [],
  });

  const createService = () => {
    const templatePlaceholderTagsRenderer = {
      render: jest.fn(),
    };
    const templateValidationFeedback = {
      buildFixHint: jest.fn().mockReturnValue('Remove unused tag definitions'),
      formatValidationLine: jest
        .fn()
        .mockReturnValue(
          'Validation error: [template_tag_unused_definition] Tag definition "t1" is not used in template text. at path ["tags"]'
        ),
    };

    return {
      service: new AgentFlowProposedActionsTemplateValidatorService(
        templatePlaceholderTagsRenderer as never,
        templateValidationFeedback as never
      ),
      templatePlaceholderTagsRenderer,
      templateValidationFeedback,
    };
  };

  it('returns ok when there are no template payloads in proposed actions', () => {
    const { service, templatePlaceholderTagsRenderer } = createService();

    const result = service.validate({
      proposedActions: [
        {
          type: 'remove_source_from_template',
          id: 'act_remove',
          confidence: 0.9,
          payload: { sourceKey: 'consumption_2025' },
        },
      ],
      stateSnapshot: createStateSnapshot(['consumption_2025']),
    });

    expect(result).toEqual({ ok: true });
    expect(templatePlaceholderTagsRenderer.render).not.toHaveBeenCalled();
  });

  it('returns renderer validation error for invalid proposed action template payload', () => {
    const { service, templatePlaceholderTagsRenderer } = createService();
    templatePlaceholderTagsRenderer.render.mockReturnValue({
      ok: false,
      error: {
        code: 'template_tag_unused_definition',
        message: 'Tag definition "t1" is not used in template text.',
        path: ['tags'],
      },
    });

    const result = service.validate({
      proposedActions: [
        {
          type: 'create_source_and_attach',
          id: 'act_create',
          confidence: 0.95,
          payload: {
            suggestedSourceKey: 'projects_2025',
            text: '# Report {{value source="projects_2025"}}',
            tags: [{ id: 't1', name: 'value', params: { source: 'projects_2025' } }],
          },
        },
      ],
      stateSnapshot: createStateSnapshot(['consumption_2025']),
    });

    expect(result).toEqual({
      ok: false,
      error: {
        actionId: 'act_create',
        actionType: 'create_source_and_attach',
        validationError: {
          code: 'template_tag_unused_definition',
          message: 'Tag definition "t1" is not used in template text.',
          path: ['tags'],
        },
      },
    });
  });

  it('passes existing and suggested keys to renderer source validation context', () => {
    const { service, templatePlaceholderTagsRenderer } = createService();
    templatePlaceholderTagsRenderer.render.mockReturnValue({
      ok: true,
      value: {
        template: '# Report\n\n{{value source="projects_2025"}}',
        renderedTagsById: { t1: '{{value source="projects_2025"}}' },
      },
    });

    service.validate({
      proposedActions: [
        {
          type: 'create_source_and_attach',
          id: 'act_create',
          confidence: 0.95,
          payload: {
            suggestedSourceKey: 'projects_2025',
            text: '# Report\n\n[[TAG:t1]]',
            tags: [{ id: 't1', name: 'value', params: { source: 'projects_2025' } }],
          },
        },
      ],
      stateSnapshot: createStateSnapshot(['consumption_2025']),
    });

    expect(templatePlaceholderTagsRenderer.render).toHaveBeenCalledWith(
      expect.objectContaining({
        tagValidationOptions: expect.objectContaining({
          allowMainSource: true,
          availableSourceKeys: expect.arrayContaining(['consumption_2025', 'projects_2025']),
        }),
      })
    );
  });

  it('builds actionable feedback for model retry', () => {
    const { service, templateValidationFeedback } = createService();

    const feedback = service.buildRetrySystemFeedback({
      proposedActions: [
        {
          type: 'create_source_and_attach',
          id: 'act_create',
          confidence: 0.95,
          payload: {
            suggestedSourceKey: 'projects_2025',
            text: '# Report {{value source="projects_2025"}}',
            tags: [{ id: 't1', name: 'value', params: { source: 'projects_2025' } }],
          },
        },
      ],
      error: {
        actionId: 'act_create',
        actionType: 'create_source_and_attach',
        validationError: {
          code: 'template_tag_unused_definition',
          message: 'Tag definition "t1" is not used in template text.',
          path: ['tags'],
        },
      },
    });

    expect(feedback).toContain('invalid `proposedActions` template payload');
    expect(feedback).toContain('[template_tag_unused_definition]');
    expect(feedback).toContain('Remove unused tag definitions');
    expect(feedback).toContain('Previous invalid proposedActions');
    expect(templateValidationFeedback.buildFixHint).toHaveBeenCalledTimes(1);
    expect(templateValidationFeedback.formatValidationLine).toHaveBeenCalledTimes(1);
  });
});
