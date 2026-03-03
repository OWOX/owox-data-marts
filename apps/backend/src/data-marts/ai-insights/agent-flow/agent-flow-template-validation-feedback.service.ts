import { Injectable } from '@nestjs/common';
import type { TemplatePlaceholderTagValidationError } from '../../services/template-edit-placeholder-tags/template-edit-placeholder-tags-validation.types';

@Injectable()
export class AgentFlowTemplateValidationFeedbackService {
  buildFixHint(error: TemplatePlaceholderTagValidationError): string {
    switch (error.code) {
      case 'template_placeholder_unknown_id':
        return 'Every placeholder [[TAG:id]] in text must have a matching tag object with the same id in tags[].';
      case 'template_tag_unused_definition':
        return 'Remove unused tag definitions from tags[] or use them in text via matching [[TAG:id]] placeholders.';
      case 'template_tag_duplicate_id':
        return 'Use unique tag ids in tags[].';
      case 'template_placeholder_invalid_format':
        return 'Use placeholder format [[TAG:<id>]] with id containing letters, numbers, underscore, or dash.';
      case 'template_tag_invalid_source':
        return 'Use a valid source/sourceKey for every tag and keep source values aligned with available sources.';
      case 'template_tag_invalid_params':
        return 'Fix tag params to match tag contract (required fields, mutually exclusive params, valid types).';
      case 'template_tag_unsupported_name':
        return 'Use only supported tags (for example, table/value).';
      case 'template_render_invalid':
        return 'Ensure rendered template is valid and contains only supported Handlebars tags.';
      case 'template_text_contains_raw_tag_syntax':
        return 'Do not put raw {{...}} tags in text. Use placeholders [[TAG:id]] and define tags[] separately.';
      default:
        return 'Make template text and tags consistent and valid.';
    }
  }

  formatValidationLine(error: TemplatePlaceholderTagValidationError): string {
    const pathText = error.path?.length ? ` at path ${JSON.stringify(error.path)}` : '';
    return `Validation error: [${error.code}] ${error.message}${pathText}`;
  }
}
