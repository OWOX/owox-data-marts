import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { AgentFlowContext } from '../types';
import { InsightTemplateService } from '../../../services/insight-template.service';
import { findTemplateTagBySourceKey } from '../../../services/template-source-key-in-template.util';

export const ProposeRemoveSourceInputSchema = z.object({
  sourceKey: z.string().min(1).describe('The source key to remove, e.g. "consumption_2025".'),
});
export type ProposeRemoveSourceInput = z.infer<typeof ProposeRemoveSourceInputSchema>;

export const ProposeRemoveSourceInputJsonSchema = {
  type: 'object' as const,
  properties: {
    sourceKey: {
      type: 'string',
      description: 'The source key to remove.',
    },
  },
  required: ['sourceKey'],
  additionalProperties: false,
};

export interface ProposeRemoveSourceOutput {
  proposedActionType: 'remove_source_from_template';
  sourceKey: string;
  /** The exact tag string found in the template that will be removed, or null if not found */
  tagToRemove: string | null;
}

@Injectable()
export class ProposeRemoveSourceTool {
  constructor(private readonly insightTemplateService: InsightTemplateService) {}
  async execute(
    args: ProposeRemoveSourceInput,
    context: AgentFlowContext
  ): Promise<ProposeRemoveSourceOutput> {
    const { request } = context;

    const templateEntity = await this.insightTemplateService.getByIdAndDataMartIdAndProjectId(
      request.sessionContext.templateId,
      request.dataMartId,
      request.projectId
    );

    const templateText = templateEntity.template ?? '';

    const tagToRemove = findTemplateTagBySourceKey(templateText, args.sourceKey);

    return {
      proposedActionType: 'remove_source_from_template',
      sourceKey: args.sourceKey,
      tagToRemove,
    };
  }
}
