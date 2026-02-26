import { Injectable, Logger } from '@nestjs/common';
import { InsightTemplateSource } from '../../dto/schemas/insight-template/insight-template-source.schema';
import { InsightArtifact } from '../../entities/insight-artifact.entity';
import { InsightArtifactService } from '../../services/insight-artifact.service';
import { InsightTemplateService } from '../../services/insight-template.service';
import { AssistantOrchestratorRequest } from './ai-assistant-types';

export interface ResolvedTemplateSource {
  key: string;
  artifactId?: string;
  artifactTitle?: string;
  sqlSummary?: string;
}

export interface ListTemplateSourcesResult {
  sources: ResolvedTemplateSource[];
  diagnostics: string[];
}

export interface UnlinkedArtifactCandidate {
  artifactId: string;
  artifactTitle?: string;
  sqlSummary?: string;
}

export interface ListUnlinkedArtifactSourcesResult {
  artifacts: UnlinkedArtifactCandidate[];
  diagnostics: string[];
}

export interface ResolveSourceByKeyResult {
  matchedSource?: ResolvedTemplateSource;
  confidence: number;
  reason: string;
}

@Injectable()
export class SourceResolverToolsService {
  private readonly logger = new Logger(SourceResolverToolsService.name);

  constructor(
    private readonly insightTemplateService: InsightTemplateService,
    private readonly insightArtifactService: InsightArtifactService
  ) {}

  async listTemplateSources(
    request: AssistantOrchestratorRequest
  ): Promise<ListTemplateSourcesResult> {
    const template = await this.insightTemplateService.getByIdAndDataMartIdAndProjectId(
      request.sessionContext.templateId,
      request.dataMartId,
      request.projectId
    );
    const diagnostics: string[] = [];
    const sources = await Promise.all(
      (template.sources ?? []).map(source =>
        this.buildResolvedSourceCandidate(source, request, diagnostics)
      )
    );

    return { sources, diagnostics };
  }

  async listUnlinkedArtifactSources(params: {
    request: AssistantOrchestratorRequest;
    linkedArtifactIds: string[];
  }): Promise<ListUnlinkedArtifactSourcesResult> {
    const { request, linkedArtifactIds } = params;
    const diagnostics: string[] = [];
    const normalizedLinkedArtifactIds = [...new Set(linkedArtifactIds.map(id => id.trim()))].filter(
      Boolean
    );

    const artifacts =
      await this.insightArtifactService.listByDataMartIdAndProjectIdExcludingArtifactIds({
        dataMartId: request.dataMartId,
        projectId: request.projectId,
        excludedArtifactIds: normalizedLinkedArtifactIds,
      });

    const unlinkedArtifacts: UnlinkedArtifactCandidate[] = [];
    for (const artifact of artifacts) {
      const candidate = this.buildResolvedUnlinkedArtifactCandidate(artifact);
      unlinkedArtifacts.push(candidate);
    }

    return { artifacts: unlinkedArtifacts, diagnostics };
  }

  resolveSourceByKey(
    sources: ResolvedTemplateSource[],
    sourceKey: string
  ): ResolveSourceByKeyResult {
    const normalizedLookup = this.normalizeIdentifier(sourceKey);
    if (!normalizedLookup) {
      return {
        confidence: 0,
        reason: 'Explicit source key is empty after normalization.',
      };
    }

    const exactByKey = sources.find(
      source => this.normalizeIdentifier(source.key) === normalizedLookup
    );
    if (!exactByKey) {
      return {
        confidence: 0,
        reason: `Explicit source key "${sourceKey}" is not found.`,
      };
    }

    return {
      matchedSource: exactByKey,
      confidence: 1,
      reason: `Explicit source key "${sourceKey}" matched "${exactByKey.key}".`,
    };
  }

  private async buildResolvedSourceCandidate(
    source: InsightTemplateSource,
    request: AssistantOrchestratorRequest,
    diagnostics: string[]
  ): Promise<ResolvedTemplateSource> {
    if (!source.artifactId) {
      return {
        key: source.key,
        artifactId: source.artifactId ?? undefined,
        artifactTitle: undefined,
        sqlSummary: undefined,
      };
    }

    try {
      const artifact = await this.insightArtifactService.getByIdAndDataMartIdAndProjectId(
        source.artifactId,
        request.dataMartId,
        request.projectId
      );

      return {
        key: source.key,
        artifactId: source.artifactId,
        artifactTitle: artifact.title ?? undefined,
        sqlSummary: this.buildSqlSummary(artifact.sql),
      };
    } catch (error: unknown) {
      diagnostics.push(
        `Source "${source.key}" artifact "${source.artifactId}" is unavailable for matching.`
      );
      this.logger.warn('Failed to load source artifact while building resolver candidates', {
        sourceKey: source.key,
        artifactId: source.artifactId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        key: source.key,
        artifactId: source.artifactId,
        artifactTitle: undefined,
        sqlSummary: undefined,
      };
    }
  }

  private buildResolvedUnlinkedArtifactCandidate(
    artifact: InsightArtifact
  ): UnlinkedArtifactCandidate {
    return {
      artifactId: artifact.id,
      artifactTitle: artifact.title ?? undefined,
      sqlSummary: this.buildSqlSummary(artifact.sql),
    };
  }

  private buildSqlSummary(sql: string | null | undefined): string | undefined {
    const compact = (sql ?? '').replace(/\s+/g, ' ').trim();
    if (!compact) {
      return undefined;
    }

    if (compact.length <= 180) {
      return compact;
    }

    return `${compact.slice(0, 177)}...`;
  }

  private normalizeIdentifier(value: string | null | undefined): string {
    return (value ?? '')
      .toLowerCase()
      .replace(/[`"'“”‘’]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }
}
