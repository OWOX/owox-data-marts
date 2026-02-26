import { Injectable } from '@nestjs/common';
import Handlebars from 'handlebars';
import {
  failTemplatePlaceholderTagValidation,
  okTemplatePlaceholderTagValidation,
  TemplatePlaceholderTagValidationResult,
} from './template-edit-placeholder-tags-validation.types';
import { castError } from '@owox/internal-helpers';

const UNRESOLVED_PLACEHOLDER_MARKER = '[[TAG:';
const SUPPORTED_TEMPLATE_TAG_NAMES = new Set(['table', 'value']);

@Injectable()
export class TemplateFinalValidator {
  validate(template: string): TemplatePlaceholderTagValidationResult<void> {
    if (template.includes(UNRESOLVED_PLACEHOLDER_MARKER)) {
      return failTemplatePlaceholderTagValidation({
        code: 'template_render_invalid',
        message: 'Rendered template still contains unresolved placeholders [[TAG:id]].',
      });
    }

    try {
      const ast = Handlebars.parse(template);
      const invalidTag = this.findUnsupportedTagName(ast);
      if (invalidTag) {
        return failTemplatePlaceholderTagValidation({
          code: 'template_render_invalid',
          message: `Rendered template contains unsupported tag "${invalidTag}".`,
        });
      }

      return okTemplatePlaceholderTagValidation(undefined);
    } catch (error: unknown) {
      return failTemplatePlaceholderTagValidation({
        code: 'template_render_invalid',
        message: `Rendered template is not valid Handlebars/template syntax: ${castError(error).message}`,
      });
    }
  }

  private findUnsupportedTagName(node: unknown): string | null {
    if (Array.isArray(node)) {
      for (const item of node) {
        const nested = this.findUnsupportedTagName(item);
        if (nested) return nested;
      }
      return null;
    }

    if (!node || typeof node !== 'object') {
      return null;
    }

    const candidate = node as {
      type?: string;
      path?: { original?: string };
    };

    if (
      (candidate.type === 'MustacheStatement' ||
        candidate.type === 'BlockStatement' ||
        candidate.type === 'SubExpression') &&
      typeof candidate.path?.original === 'string'
    ) {
      const tagName = candidate.path.original;
      if (!SUPPORTED_TEMPLATE_TAG_NAMES.has(tagName)) {
        return tagName;
      }
    }

    for (const value of Object.values(node as Record<string, unknown>)) {
      const nested = this.findUnsupportedTagName(value);
      if (nested) return nested;
    }

    return null;
  }
}
