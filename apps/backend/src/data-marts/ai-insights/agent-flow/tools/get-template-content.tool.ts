import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { InsightTemplateService } from '../../../services/insight-template.service';
import { AgentFlowContext } from '../types';
import { isDefaultInsightTemplate } from '../../../template/default-insight-template';
import { TemplateEditPlaceholderTag } from '../../../services/template-edit-placeholder-tags/template-edit-placeholder-tags.contracts';
import { TemplateToPlaceholderTagsConverterService } from '../../../services/template-edit-placeholder-tags/template-to-placeholder-tags-converter.service';

export const GetTemplateContentInputSchema = z.object({});
export type GetTemplateContentInput = z.infer<typeof GetTemplateContentInputSchema>;

export const GetTemplateContentInputJsonSchema = {
  type: 'object' as const,
  properties: {},
  required: [],
  additionalProperties: false,
};

export interface GetTemplateContentOutput {
  template: {
    text: string;
    tags: TemplateEditPlaceholderTag[];
  } | null;
}

@Injectable()
export class GetTemplateContentTool {
  constructor(
    private readonly insightTemplateService: InsightTemplateService,
    private readonly templateToPlaceholderTagsConverter: TemplateToPlaceholderTagsConverterService
  ) {}

  async execute(
    _args: GetTemplateContentInput,
    context: AgentFlowContext
  ): Promise<GetTemplateContentOutput> {
    const { request } = context;
    const templateId = request.sessionContext.templateId;

    const template = await this.insightTemplateService.getByIdAndDataMartIdAndProjectId(
      templateId,
      request.dataMartId,
      request.projectId
    );
    const templateContent = template.template ?? '';
    const shouldHideDefaultTemplate = isDefaultInsightTemplate(templateContent);

    return {
      template: shouldHideDefaultTemplate
        ? null
        : this.templateToPlaceholderTagsConverter.toPlaceholderDocument(templateContent),
    };
  }
}
