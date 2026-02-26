import { Injectable } from '@nestjs/common';
import { TemplateEditPlaceholderTag } from './template-edit-placeholder-tags.contracts';
import {
  failTemplatePlaceholderTagValidation,
  okTemplatePlaceholderTagValidation,
  TemplatePlaceholderTagValidationResult,
} from './template-edit-placeholder-tags-validation.types';

@Injectable()
export class TemplateTagRenderer {
  renderTag(tag: TemplateEditPlaceholderTag): TemplatePlaceholderTagValidationResult<string> {
    switch (tag.name) {
      case 'table':
        return this.renderTableTag(tag);
      case 'value':
        return this.renderSingleValueTag(tag);
      default:
        return failTemplatePlaceholderTagValidation({
          code: 'template_tag_unsupported_name',
          message: `Unsupported template tag "${tag.name}".`,
          details: { tagId: tag.id, tagName: tag.name },
        });
    }
  }

  renderTagsById(
    tags: readonly TemplateEditPlaceholderTag[]
  ): TemplatePlaceholderTagValidationResult<Record<string, string>> {
    const rendered: Record<string, string> = {};

    for (const tag of tags) {
      const tagRendered = this.renderTag(tag);
      if (!tagRendered.ok) {
        return tagRendered;
      }
      rendered[tag.id] = tagRendered.value;
    }

    return okTemplatePlaceholderTagValidation(rendered);
  }

  private renderTableTag(
    tag: TemplateEditPlaceholderTag
  ): TemplatePlaceholderTagValidationResult<string> {
    const params = this.asRecord(tag.params);
    const source = this.readCanonicalSource(params);
    if (!source) {
      return failTemplatePlaceholderTagValidation({
        code: 'template_tag_invalid_params',
        message: `Tag "${tag.name}" (${tag.id}) is missing "source" or "sourceKey".`,
        details: { tagId: tag.id, tagName: tag.name },
      });
    }

    const attrs: string[] = [`source="${this.escapeAttribute(source)}"`];

    const columns = this.readOptionalString(params.columns);
    if (columns) attrs.push(`columns="${this.escapeAttribute(columns)}"`);

    const limit = params.limit;
    if (typeof limit === 'number' && Number.isFinite(limit)) {
      attrs.push(`limit="${String(Math.trunc(limit))}"`);
    }

    const from = this.readOptionalString(params.from);
    if (from) attrs.push(`from="${this.escapeAttribute(from)}"`);

    return okTemplatePlaceholderTagValidation(`{{table ${attrs.join(' ')}}}`);
  }

  private renderSingleValueTag(
    tag: TemplateEditPlaceholderTag
  ): TemplatePlaceholderTagValidationResult<string> {
    const params = this.asRecord(tag.params);
    const source = this.readCanonicalSource(params);
    if (!source) {
      return failTemplatePlaceholderTagValidation({
        code: 'template_tag_invalid_params',
        message: `Tag "${tag.name}" (${tag.id}) is missing "source" or "sourceKey".`,
        details: { tagId: tag.id, tagName: tag.name },
      });
    }

    const attrs: string[] = [`source="${this.escapeAttribute(source)}"`];
    const path = this.readOptionalString(params.path);

    if (path) {
      attrs.push(`path="${this.escapeAttribute(path)}"`);
    } else {
      const column = this.readOptionalScalar(params.column);
      const row = this.readOptionalScalar(params.row);
      if (column != null) attrs.push(`column="${this.escapeAttribute(String(column))}"`);
      if (row != null) attrs.push(`row="${this.escapeAttribute(String(row))}"`);
    }

    return okTemplatePlaceholderTagValidation(`{{value ${attrs.join(' ')}}}`);
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  }

  private readCanonicalSource(params: Record<string, unknown>): string | null {
    const source = this.readOptionalString(params.source);
    const sourceKey = this.readOptionalString(params.sourceKey);
    return source ?? sourceKey ?? null;
  }

  private readOptionalString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private readOptionalScalar(value: unknown): string | number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    return null;
  }

  private escapeAttribute(value: string): string {
    return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  }
}
