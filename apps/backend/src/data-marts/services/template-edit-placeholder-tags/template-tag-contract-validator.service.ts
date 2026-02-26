import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { TemplateEditPlaceholderTag } from './template-edit-placeholder-tags.contracts';
import {
  failTemplatePlaceholderTagValidation,
  okTemplatePlaceholderTagValidation,
  TemplatePlaceholderTagValidationResult,
} from './template-edit-placeholder-tags-validation.types';

export interface TemplateTagContractValidationOptions {
  availableSourceKeys?: readonly string[];
  allowMainSource?: boolean;
}

const TAG_SOURCE_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;

const TableTagParamsSchema = z
  .object({
    source: z.string().min(1).optional(),
    sourceKey: z.string().min(1).optional(),
    limit: z.number().int().positive().optional(),
    from: z.enum(['start', 'end']).optional(),
    columns: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.source && !value.sourceKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Either "source" or "sourceKey" is required.',
        path: ['source'],
      });
    }

    if (value.source && value.sourceKey && value.source.trim() !== value.sourceKey.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '"source" and "sourceKey" must match when both are provided.',
        path: ['sourceKey'],
      });
    }
  });

const SingleValueTagParamsSchema = z
  .object({
    source: z.string().min(1).optional(),
    sourceKey: z.string().min(1).optional(),
    path: z.string().min(1).optional(),
    row: z.union([z.string().min(1), z.number()]).optional(),
    column: z.union([z.string().min(1), z.number()]).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.source && !value.sourceKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Either "source" or "sourceKey" is required.',
        path: ['source'],
      });
    }

    if (value.source && value.sourceKey && value.source.trim() !== value.sourceKey.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '"source" and "sourceKey" must match when both are provided.',
        path: ['sourceKey'],
      });
    }

    if (value.path && (value.row != null || value.column != null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '"path" cannot be combined with "row" or "column".',
        path: ['path'],
      });
    }
  });

@Injectable()
export class TemplateTagContractValidator {
  validateAll(
    tags: readonly TemplateEditPlaceholderTag[],
    options: TemplateTagContractValidationOptions = {}
  ): TemplatePlaceholderTagValidationResult<void> {
    for (let index = 0; index < tags.length; index++) {
      const result = this.validateTag(tags[index], index, options);
      if (!result.ok) {
        return result;
      }
    }

    return okTemplatePlaceholderTagValidation(undefined);
  }

  private validateTag(
    tag: TemplateEditPlaceholderTag,
    index: number,
    options: TemplateTagContractValidationOptions
  ): TemplatePlaceholderTagValidationResult<void> {
    switch (tag.name) {
      case 'table':
        return this.validateBySchema(tag, index, TableTagParamsSchema, options);
      case 'value':
        return this.validateBySchema(tag, index, SingleValueTagParamsSchema, options);
      default:
        return failTemplatePlaceholderTagValidation({
          code: 'template_tag_unsupported_name',
          message: `Unsupported template tag "${tag.name}".`,
          path: ['tags', index, 'name'],
          details: { tagName: tag.name, tagId: tag.id },
        });
    }
  }

  private validateBySchema(
    tag: TemplateEditPlaceholderTag,
    index: number,
    schema: z.ZodTypeAny,
    options: TemplateTagContractValidationOptions
  ): TemplatePlaceholderTagValidationResult<void> {
    const parsed = schema.safeParse(tag.params);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return failTemplatePlaceholderTagValidation({
        code: 'template_tag_invalid_params',
        message:
          `Invalid params for tag "${tag.name}" (${tag.id}). ${firstIssue?.message ?? ''}`.trim(),
        path:
          firstIssue?.path && firstIssue.path.length > 0
            ? ['tags', index, 'params', ...firstIssue.path]
            : ['tags', index, 'params'],
        details: {
          tagName: tag.name,
          tagId: tag.id,
        },
      });
    }

    const sourceValidation = this.validateSource(
      tag,
      index,
      parsed.data as Record<string, unknown>,
      options
    );
    if (!sourceValidation.ok) {
      return sourceValidation;
    }

    return okTemplatePlaceholderTagValidation(undefined);
  }

  private validateSource(
    tag: TemplateEditPlaceholderTag,
    index: number,
    params: Record<string, unknown>,
    options: TemplateTagContractValidationOptions
  ): TemplatePlaceholderTagValidationResult<void> {
    const source = this.readSource(params);
    if (!source) {
      return failTemplatePlaceholderTagValidation({
        code: 'template_tag_invalid_source',
        message: `Tag "${tag.name}" (${tag.id}) must define "source" or "sourceKey".`,
        path: ['tags', index, 'params'],
        details: { tagName: tag.name, tagId: tag.id },
      });
    }

    if (!TAG_SOURCE_KEY_PATTERN.test(source)) {
      return failTemplatePlaceholderTagValidation({
        code: 'template_tag_invalid_source',
        message: `Invalid source key "${source}" for tag "${tag.name}" (${tag.id}).`,
        path: ['tags', index, 'params', 'source'],
        details: { source, tagName: tag.name, tagId: tag.id },
      });
    }

    const allowMain = options.allowMainSource !== false;
    if (allowMain && source === 'main') {
      return okTemplatePlaceholderTagValidation(undefined);
    }

    if (options.availableSourceKeys && !options.availableSourceKeys.includes(source)) {
      return failTemplatePlaceholderTagValidation({
        code: 'template_tag_invalid_source',
        message: `Source "${source}" is not available for tag "${tag.name}" (${tag.id}).`,
        path: ['tags', index, 'params', 'source'],
        details: {
          source,
          tagName: tag.name,
          tagId: tag.id,
          availableSourceKeys: [...options.availableSourceKeys],
        },
      });
    }

    return okTemplatePlaceholderTagValidation(undefined);
  }

  private readSource(params: Record<string, unknown>): string | null {
    const source = typeof params.source === 'string' ? params.source.trim() : '';
    const sourceKey = typeof params.sourceKey === 'string' ? params.sourceKey.trim() : '';

    if (source) return source;
    if (sourceKey) return sourceKey;
    return null;
  }
}
