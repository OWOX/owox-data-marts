import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AgentFlowContext } from '../types';
import { TemplateTagsService } from '../../../services/template-tags/template-tags.service';

const InputSchema = z.object({});
type Input = z.infer<typeof InputSchema>;

@Injectable()
export class ListAvailableTagsTool {
  public readonly name = 'source_list_available_tags';
  public readonly description =
    'Returns a list of all available template tags that can be used in the report. ALWAYS use this tool to verify which tags are supported before generating any template content.';
  public readonly inputSchema = InputSchema;

  constructor(private readonly templateTagsService: TemplateTagsService) {}

  async execute(_args: Input, _context: AgentFlowContext): Promise<unknown> {
    const tags = this.templateTagsService.getAllTagsMeta();
    return {
      tags,
      instruction:
        'Use ONLY these tags. Do NOT invent other tags like {{date}}, {{user}}, etc. If a tag is not in this list, it is not supported.',
    };
  }
}
