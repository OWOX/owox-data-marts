import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { SourceResolverToolsService } from '../source-resolver-tools.service';
import { AgentFlowContext } from '../types';

export const ListArtifactsInputSchema = z.object({});
export type ListArtifactsInput = z.infer<typeof ListArtifactsInputSchema>;

export const ListArtifactsInputJsonSchema = {
  type: 'object' as const,
  properties: {},
  required: [],
  additionalProperties: false,
};

export interface ArtifactItem {
  id: string;
  /** Opaque handle for refining SQL via source_generate_sql (mode="refine") */
  baseSqlHandle: string;
  title?: string;
  /** Full SQL of this artifact — LLM reads it to decide if it answers the user's question */
  sql?: string;
}

export interface ListArtifactsOutput {
  artifacts: ArtifactItem[];
  diagnostics: string[];
}

@Injectable()
export class ListArtifactsTool {
  constructor(private readonly sourceResolver: SourceResolverToolsService) {}

  async execute(
    _args: ListArtifactsInput,
    context: AgentFlowContext
  ): Promise<ListArtifactsOutput> {
    const { request } = context;

    // Collect artifact IDs already linked to the template so we exclude them
    const linkedArtifactIds: string[] = [];
    if (request.sessionContext.templateId) {
      const linkedResult = await this.sourceResolver.listTemplateSources(request);
      for (const source of linkedResult.sources) {
        if (source.artifactId) {
          linkedArtifactIds.push(source.artifactId);
        }
      }
    }

    const result = await this.sourceResolver.listUnlinkedArtifactSources({
      request,
      linkedArtifactIds,
    });

    const artifacts: ArtifactItem[] = result.artifacts.map(artifact => ({
      id: artifact.artifactId,
      baseSqlHandle: `art:${artifact.artifactId}`,
      title: artifact.artifactTitle,
      sql: artifact.sqlSummary,
    }));

    return { artifacts, diagnostics: result.diagnostics };
  }
}
