import { Injectable } from '@nestjs/common';
import { DEFAULT_SOURCE_KEY } from '../../common/template/handlers/tag-handler.interface';
import { TemplateToPlaceholderTagsConverterService } from './template-edit-placeholder-tags/template-to-placeholder-tags-converter.service';

@Injectable()
export class InsightTemplateSourceUsageService {
  constructor(
    private readonly templateToPlaceholderTagsConverter: TemplateToPlaceholderTagsConverterService
  ) {}

  getUsedSourceKeys(template: string | null | undefined): string[] {
    if (!template?.trim()) {
      return [];
    }

    const document = this.templateToPlaceholderTagsConverter.toPlaceholderDocument(template);
    const sourceKeys = new Set<string>();

    for (const tag of document.tags) {
      const sourceKey = this.readTagSourceKey(tag.params);
      if (sourceKey) {
        sourceKeys.add(sourceKey);
      }
    }

    return Array.from(sourceKeys);
  }

  private readTagSourceKey(params: Record<string, unknown>): string | null {
    const source = this.readOptionalString(params.source);
    if (source) {
      return source;
    }

    const sourceKey = this.readOptionalString(params.sourceKey);
    if (sourceKey) {
      return sourceKey;
    }

    const sourceWasProvided = this.hasOwnKey(params, 'source');
    const sourceKeyWasProvided = this.hasOwnKey(params, 'sourceKey');
    if (sourceWasProvided || sourceKeyWasProvided) {
      return null;
    }

    return DEFAULT_SOURCE_KEY;
  }

  private readOptionalString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private hasOwnKey(object: Record<string, unknown>, property: string): boolean {
    return Object.prototype.hasOwnProperty.call(object, property);
  }
}
