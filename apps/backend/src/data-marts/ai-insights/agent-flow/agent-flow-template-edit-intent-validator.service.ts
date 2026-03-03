import { Injectable } from '@nestjs/common';
import { AgentFlowTemplateEditIntent } from './types';
import { TemplatePlaceholderTagValidationError } from '../../services/template-edit-placeholder-tags/template-edit-placeholder-tags-validation.types';
import { TemplatePlaceholderTagsRendererService } from '../../services/template-edit-placeholder-tags/template-placeholder-tags-renderer.service';
import { AgentFlowTemplateValidationFeedbackService } from './agent-flow-template-validation-feedback.service';

export class AgentFlowTemplateEditIntentInvalidError extends Error {
  constructor(
    public readonly validationError: TemplatePlaceholderTagValidationError,
    public readonly retryAttempts: number
  ) {
    super(
      `template_edit_intent_invalid_after_${retryAttempts}_retries:` +
        `${validationError.code}:${validationError.message}`
    );
  }
}

export type TemplateEditIntentValidationResult =
  | { ok: true }
  | {
      ok: false;
      error: TemplatePlaceholderTagValidationError;
    };

@Injectable()
export class AgentFlowTemplateEditIntentValidatorService {
  constructor(
    private readonly templatePlaceholderTagsRenderer: TemplatePlaceholderTagsRendererService,
    private readonly templateValidationFeedback: AgentFlowTemplateValidationFeedbackService
  ) {}

  validate(
    templateEditIntent: AgentFlowTemplateEditIntent | undefined
  ): TemplateEditIntentValidationResult {
    if (!templateEditIntent) {
      return { ok: true };
    }

    const renderResult = this.templatePlaceholderTagsRenderer.render({
      text: templateEditIntent.text,
      tags: templateEditIntent.tags,
      tagValidationOptions: {
        allowMainSource: true,
      },
    });

    if (renderResult.ok) {
      return { ok: true };
    }

    return {
      ok: false,
      error: renderResult.error,
    };
  }

  buildRetrySystemFeedback(params: {
    templateEditIntent: AgentFlowTemplateEditIntent;
    error: TemplatePlaceholderTagValidationError;
  }): string {
    const { templateEditIntent, error } = params;
    const validationLine = this.templateValidationFeedback.formatValidationLine(error);
    const fixHint = this.templateValidationFeedback.buildFixHint(error);

    return (
      'Your previous response had an invalid `templateEditIntent` and cannot be applied.\n' +
      `${validationLine}\n` +
      `How to fix: ${fixHint}\n` +
      'Return the full JSON response again (same schema), with corrected `templateEditIntent.text`/`templateEditIntent.tags`.\n' +
      'Do not change unrelated fields unless needed for consistency.\n' +
      `Previous invalid templateEditIntent: ${JSON.stringify(templateEditIntent)}`
    );
  }
}
