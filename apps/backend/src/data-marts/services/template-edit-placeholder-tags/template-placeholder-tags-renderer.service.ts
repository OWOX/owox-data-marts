import { Injectable } from '@nestjs/common';
import { TemplateEditPlaceholderTag } from './template-edit-placeholder-tags.contracts';
import { TemplatePlaceholderValidator } from './template-placeholder-validator.service';
import {
  TemplateTagContractValidationOptions,
  TemplateTagContractValidator,
} from './template-tag-contract-validator.service';
import { TemplateTagRenderer } from './template-tag-renderer.service';
import { TemplateTemplateAssembler } from './template-template-assembler.service';
import { TemplateFinalValidator } from './template-final-validator.service';
import { TemplatePlaceholderTagValidationResult } from './template-edit-placeholder-tags-validation.types';

export interface TemplatePlaceholderTagsRenderInput {
  text: string;
  tags: TemplateEditPlaceholderTag[];
  tagValidationOptions?: TemplateTagContractValidationOptions;
}

export interface TemplatePlaceholderTagsRenderOutput {
  template: string;
  renderedTagsById: Record<string, string>;
}

@Injectable()
export class TemplatePlaceholderTagsRendererService {
  constructor(
    private readonly placeholderValidator: TemplatePlaceholderValidator,
    private readonly tagContractValidator: TemplateTagContractValidator,
    private readonly tagRenderer: TemplateTagRenderer,
    private readonly assembler: TemplateTemplateAssembler,
    private readonly finalValidator: TemplateFinalValidator
  ) {}

  render(
    input: TemplatePlaceholderTagsRenderInput
  ): TemplatePlaceholderTagValidationResult<TemplatePlaceholderTagsRenderOutput> {
    const placeholderValidation = this.placeholderValidator.validate({
      text: input.text,
      tags: input.tags,
    });
    if (!placeholderValidation.ok) {
      return placeholderValidation;
    }

    const tagValidation = this.tagContractValidator.validateAll(
      input.tags,
      input.tagValidationOptions
    );
    if (!tagValidation.ok) {
      return tagValidation;
    }

    const renderedTags = this.tagRenderer.renderTagsById(input.tags);
    if (!renderedTags.ok) {
      return renderedTags;
    }

    const assembled = this.assembler.assemble({
      text: input.text,
      renderedTagsById: renderedTags.value,
    });
    if (!assembled.ok) {
      return assembled;
    }

    const finalValidation = this.finalValidator.validate(assembled.value);
    if (!finalValidation.ok) {
      return finalValidation;
    }

    return {
      ok: true,
      value: {
        template: assembled.value,
        renderedTagsById: renderedTags.value,
      },
    };
  }
}
