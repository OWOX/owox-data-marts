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
  templateSourceId?: string;
  /** Source key used in the template tag, e.g. "consumption" */
  key: string;
  /** Opaque handle for refining SQL via source_generate_sql (mode="refine"), if source is linked */
  baseSqlHandle?: string;
  /** The artifact ID this source points to */
  artifactId?: string;
  /** Title of the linked artifact */
  artifactTitle?: string;
  /** Full SQL of the linked artifact — LLM reads this to understand what the source does */
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
      const srcHandleId = source.templateSourceId ?? source.key;

      return {
        templateSourceId: source.templateSourceId,
        key: source.key,
        baseSqlHandle: source.artifactId ? `src:${srcHandleId}` : undefined,
        artifactId: source.artifactId,
        artifactTitle: source.artifactTitle,
        // sqlSummary is a lightweight text extracted from SQL — we use it as 'sql' field name
        // to signal to LLM that this is the actual query logic
        sql: source.sqlSummary,
      };
    });

    return { sources, diagnostics: result.diagnostics };
  }
}
