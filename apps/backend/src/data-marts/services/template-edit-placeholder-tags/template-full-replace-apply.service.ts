import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { InsightTemplate } from '../../entities/insight-template.entity';
import { InsightTemplateService } from '../insight-template.service';
import { InsightTemplateValidationService } from '../insight-template-validation.service';
import { TemplateEditPlaceholderTag } from './template-edit-placeholder-tags.contracts';
import { TemplatePlaceholderTagsRendererService } from './template-placeholder-tags-renderer.service';

export interface TemplateFullReplaceApplyInput {
  templateId: string;
  dataMartId: string;
  projectId: string;
  text: string;
  tags: TemplateEditPlaceholderTag[];
}

export interface TemplateFullReplaceApplyResult {
  templateId: string;
  templateUpdated: boolean;
  status: 'updated' | 'no_op' | 'validation_failed';
  reason: string;
  renderedTemplate: string | null;
}

@Injectable()
export class TemplateFullReplaceApplyService {
  private readonly logger = new Logger(TemplateFullReplaceApplyService.name);

  constructor(
    @InjectRepository(InsightTemplate)
    private readonly templateRepository: Repository<InsightTemplate>,
    private readonly insightTemplateService: InsightTemplateService,
    private readonly insightTemplateValidationService: InsightTemplateValidationService,
    private readonly placeholderTagsRenderer: TemplatePlaceholderTagsRendererService
  ) {}

  async apply(input: TemplateFullReplaceApplyInput): Promise<TemplateFullReplaceApplyResult> {
    const template = await this.insightTemplateService.getByIdAndDataMartIdAndProjectId(
      input.templateId,
      input.dataMartId,
      input.projectId
    );

    const currentTemplateText = template.template ?? '';

    const renderResult = this.placeholderTagsRenderer.render({
      text: input.text,
      tags: input.tags,
      tagValidationOptions: {
        availableSourceKeys: (template.sources ?? []).map(source => source.key),
        allowMainSource: true,
      },
    });

    if (!renderResult.ok) {
      this.logger.warn('template_full_replace_validation_failed', {
        templateId: template.id,
        code: renderResult.error.code,
        message: renderResult.error.message,
      });
      return {
        templateId: template.id,
        templateUpdated: false,
        status: 'validation_failed',
        reason: `${renderResult.error.code}: ${renderResult.error.message}`,
        renderedTemplate: null,
      };
    }

    const nextTemplateText = renderResult.value.template;

    if (currentTemplateText === nextTemplateText) {
      this.logger.log('template_full_replace_no_op', {
        templateId: template.id,
        status: 'no_op',
        reason: 'template_full_replace_no_changes',
      });
      return {
        templateId: template.id,
        templateUpdated: false,
        status: 'no_op',
        reason: 'template_full_replace_no_changes',
        renderedTemplate: nextTemplateText,
      };
    }

    this.insightTemplateValidationService.validateTemplateText(nextTemplateText);

    const updateResult = await this.templateRepository.update(
      {
        id: template.id,
        template: typeof template.template === 'string' ? template.template : IsNull(),
      },
      {
        template: nextTemplateText,
      }
    );

    if (!updateResult.affected) {
      this.logger.warn('template_full_replace_conflict', {
        templateId: template.id,
        code: 'template_update_conflict',
      });
      throw new ConflictException({
        code: 'template_update_conflict',
        message:
          'Template content changed during apply. Please regenerate the template edit proposal.',
      });
    }

    this.logger.log('template_full_replace_applied', {
      templateId: template.id,
      status: 'updated',
      reason: 'replace_template_document',
    });

    return {
      templateId: template.id,
      templateUpdated: true,
      status: 'updated',
      reason: 'replace_template_document',
      renderedTemplate: nextTemplateText,
    };
  }
}
