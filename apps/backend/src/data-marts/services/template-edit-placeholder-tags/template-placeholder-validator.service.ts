import { Injectable } from '@nestjs/common';
import { TemplateEditPlaceholderTag } from './template-edit-placeholder-tags.contracts';
import {
  failTemplatePlaceholderTagValidation,
  okTemplatePlaceholderTagValidation,
  TemplatePlaceholderTagValidationResult,
} from './template-edit-placeholder-tags-validation.types';

export interface TemplatePlaceholderValidationOutput {
  placeholderIdsInOrder: string[];
  placeholderIdsUnique: string[];
}

export interface TemplatePlaceholderConsistencyInput {
  text: string;
  tags: Array<Pick<TemplateEditPlaceholderTag, 'id'>>;
}

const PLACEHOLDER_LIKE_GLOBAL_PATTERN = /\[\[TAG:([^\]]*)]]/g;
const PLACEHOLDER_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

@Injectable()
export class TemplatePlaceholderValidator {
  validate(
    input: TemplatePlaceholderConsistencyInput
  ): TemplatePlaceholderTagValidationResult<TemplatePlaceholderValidationOutput> {
    const textValidation = this.validateText(input.text);
    if (!textValidation.ok) {
      return textValidation;
    }

    const tagIds = input.tags.map(tag => tag.id);
    const duplicateTagId = this.findDuplicate(tagIds);
    if (duplicateTagId) {
      return failTemplatePlaceholderTagValidation({
        code: 'template_tag_duplicate_id',
        message: `Duplicate tag definition id "${duplicateTagId}" is not allowed.`,
        path: ['tags'],
        details: { duplicateId: duplicateTagId },
      });
    }

    const placeholderIdSet = new Set(textValidation.value.placeholderIdsUnique);
    const tagIdSet = new Set(tagIds);

    for (const placeholderId of textValidation.value.placeholderIdsUnique) {
      if (!tagIdSet.has(placeholderId)) {
        return failTemplatePlaceholderTagValidation({
          code: 'template_placeholder_unknown_id',
          message: `Placeholder [[TAG:${placeholderId}]] does not have a matching tag definition.`,
          path: ['text'],
          details: { placeholderId },
        });
      }
    }

    for (const tagId of tagIds) {
      if (!placeholderIdSet.has(tagId)) {
        return failTemplatePlaceholderTagValidation({
          code: 'template_tag_unused_definition',
          message: `Tag definition "${tagId}" is not used in template text.`,
          path: ['tags'],
          details: { tagId },
        });
      }
    }

    return textValidation;
  }

  validateText(
    text: string
  ): TemplatePlaceholderTagValidationResult<TemplatePlaceholderValidationOutput> {
    const placeholderIdsInOrder: string[] = [];
    const placeholderLikeMatches = [...text.matchAll(PLACEHOLDER_LIKE_GLOBAL_PATTERN)];

    for (const match of placeholderLikeMatches) {
      const rawId = (match[1] ?? '').trim();
      if (!PLACEHOLDER_ID_PATTERN.test(rawId)) {
        return failTemplatePlaceholderTagValidation({
          code: 'template_placeholder_invalid_format',
          message:
            `Invalid placeholder format "${match[0]}". ` +
            'Expected [[TAG:<id>]] where <id> uses letters, numbers, underscore, or dash.',
          path: ['text'],
          details: { placeholder: match[0] },
        });
      }
      placeholderIdsInOrder.push(rawId);
    }

    const strippedKnownPlaceholderBlocks = text.replace(PLACEHOLDER_LIKE_GLOBAL_PATTERN, '');
    if (strippedKnownPlaceholderBlocks.includes('[[TAG:')) {
      return failTemplatePlaceholderTagValidation({
        code: 'template_placeholder_invalid_format',
        message:
          'Template text contains malformed placeholder syntax. ' +
          'Use [[TAG:<id>]] and make sure placeholders are closed with ]].',
        path: ['text'],
      });
    }

    return okTemplatePlaceholderTagValidation({
      placeholderIdsInOrder,
      placeholderIdsUnique: Array.from(new Set(placeholderIdsInOrder)),
    });
  }

  private findDuplicate(values: readonly string[]): string | null {
    const seen = new Set<string>();
    for (const value of values) {
      if (seen.has(value)) {
        return value;
      }
      seen.add(value);
    }
    return null;
  }
}
