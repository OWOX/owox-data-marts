import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { SourceResolverToolsService } from '../source-resolver-tools.service';
import { AgentFlowContext } from '../types';

export const ListTemplateSourcesInputSchema = z.object({});
export type ListTemplateSourcesInput = z.infer<typeof ListTemplateSourcesInputSchema>;

export const ListTemplateSourcesInputJsonSchema = {
  type: 'object' as const,
  properties: {},
  required: [],
  additionalProperties: false,
};

export interface TemplateSourceItem {
  /** Stable source link ID inside template.sources */
  templateSourceId: string;
  /** Source key used in the template tag, e.g. "consumption" */
  key: string;
  /** Opaque handle for refining SQL via source_generate_sql (mode="refine"), if source is linked */
  baseSqlHandle?: string;
  /** Human-readable title for this source */
  sourceTitle?: string;
  /** Full SQL for this source — LLM reads this to understand what the source does */
  sql?: string;
}

export interface ListTemplateSourcesOutput {
  sources: TemplateSourceItem[];
  diagnostics: string[];
}

@Injectable()
export class ListTemplateSourcesTool {
  constructor(private readonly sourceResolver: SourceResolverToolsService) {}

  async execute(
    _args: ListTemplateSourcesInput,
    context: AgentFlowContext
  ): Promise<ListTemplateSourcesOutput> {
    const result = await this.sourceResolver.listTemplateSources(context.request);

    const sources: TemplateSourceItem[] = result.sources.map(source => {
      return {
        templateSourceId: source.templateSourceId,
        key: source.key,
        baseSqlHandle: `src:${source.templateSourceId}`,
        sourceTitle: source.sourceTitle,
        sql: source.sql,
      };
    });

    return { sources, diagnostics: result.diagnostics };
  }
}
