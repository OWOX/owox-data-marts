import { AgentFlowTemplateEditIntentValidatorService } from './agent-flow-template-edit-intent-validator.service';

describe('AgentFlowTemplateEditIntentValidatorService', () => {
  const createService = () => {
    const templatePlaceholderTagsRenderer = {
      render: jest.fn(),
    };
    const templateValidationFeedback = {
      buildFixHint: jest
        .fn()
        .mockReturnValue('Every placeholder [[TAG:id]] in text must have a matching tag'),
      formatValidationLine: jest
        .fn()
        .mockReturnValue(
          'Validation error: [template_placeholder_unknown_id] Placeholder [[TAG:t1]] does not have a matching tag definition.'
        ),
    };

    return {
      service: new AgentFlowTemplateEditIntentValidatorService(
        templatePlaceholderTagsRenderer as never,
        templateValidationFeedback as never
      ),
      templatePlaceholderTagsRenderer,
      templateValidationFeedback,
    };
  };

  it('returns ok when templateEditIntent is not provided', () => {
    const { service, templatePlaceholderTagsRenderer } = createService();

    expect(service.validate(undefined)).toEqual({ ok: true });
    expect(templatePlaceholderTagsRenderer.render).not.toHaveBeenCalled();
  });

  it('returns validation error from renderer', () => {
    const { service, templatePlaceholderTagsRenderer } = createService();
    templatePlaceholderTagsRenderer.render.mockReturnValue({
      ok: false,
      error: {
        code: 'template_placeholder_unknown_id',
        message: 'Placeholder [[TAG:t1]] does not have a matching tag definition.',
        path: ['text'],
      },
    });

    const result = service.validate({
      type: 'replace_template_document',
      text: '# Report\n[[TAG:t1]]',
      tags: [],
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'template_placeholder_unknown_id',
        message: 'Placeholder [[TAG:t1]] does not have a matching tag definition.',
        path: ['text'],
      },
    });
  });

  it('builds actionable feedback for model retry', () => {
    const { service, templateValidationFeedback } = createService();

    const feedback = service.buildRetrySystemFeedback({
      templateEditIntent: {
        type: 'replace_template_document',
        text: '# Report\n[[TAG:t1]]',
        tags: [],
      },
      error: {
        code: 'template_placeholder_unknown_id',
        message: 'Placeholder [[TAG:t1]] does not have a matching tag definition.',
        path: ['text'],
      },
    });

    expect(feedback).toContain('invalid `templateEditIntent`');
    expect(feedback).toContain('[template_placeholder_unknown_id]');
    expect(feedback).toContain('Every placeholder [[TAG:id]] in text must have a matching tag');
    expect(feedback).toContain('Previous invalid templateEditIntent');
    expect(templateValidationFeedback.buildFixHint).toHaveBeenCalledTimes(1);
    expect(templateValidationFeedback.formatValidationLine).toHaveBeenCalledTimes(1);
  });
});
