import { Injectable } from '@nestjs/common';
import {
  failTemplatePlaceholderTagValidation,
  okTemplatePlaceholderTagValidation,
  TemplatePlaceholderTagValidationResult,
} from './template-edit-placeholder-tags-validation.types';
import { castError } from '@owox/internal-helpers';

export interface TemplateAssemblyInput {
  text: string;
  renderedTagsById: Record<string, string>;
}

const PLACEHOLDER_PATTERN = /\[\[TAG:([A-Za-z0-9_-]+)]]/g;

@Injectable()
export class TemplateTemplateAssembler {
  assemble(input: TemplateAssemblyInput): TemplatePlaceholderTagValidationResult<string> {
    try {
      const output = input.text.replace(PLACEHOLDER_PATTERN, (_full, id: string) => {
        const renderedTag = input.renderedTagsById[id];
        if (typeof renderedTag !== 'string') {
          throw new Error(`Rendered tag for placeholder "${id}" is missing`);
        }

        return renderedTag;
      });

      return okTemplatePlaceholderTagValidation(output);
    } catch (error: unknown) {
      return failTemplatePlaceholderTagValidation({
        code: 'template_render_invalid',
        message: `Failed to assemble template text: ${castError(error)}`,
      });
    }
  }
}
