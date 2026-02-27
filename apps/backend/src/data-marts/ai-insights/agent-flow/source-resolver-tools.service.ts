import { BadRequestException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InsightTemplateSource } from '../../dto/schemas/insight-template/insight-template-source.schema';
import { InsightArtifact } from '../../entities/insight-artifact.entity';
import { InsightArtifactService } from '../../services/insight-artifact.service';
import { InsightTemplateService } from '../../services/insight-template.service';
import { InsightTemplateSourceService } from '../../services/insight-template-source.service';
import { AssistantOrchestratorRequest } from './ai-assistant-types';

export interface ResolvedTemplateSource {
  templateSourceId?: string;
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

export interface ResolveTemplateSourceSqlByKeyResult {
  templateSourceId?: string;
  sourceKey: string;
  artifactId: string;
  sql: string;
}

export interface ResolveArtifactSqlByIdResult {
  artifactId: string;
  sql: string;
}

@Injectable()
export class SourceResolverToolsService {
  private readonly logger = new Logger(SourceResolverToolsService.name);

  constructor(
    private readonly insightTemplateService: InsightTemplateService,
    private readonly insightArtifactService: InsightArtifactService,
    private readonly insightTemplateSourceService: InsightTemplateSourceService
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

  async resolveTemplateSourceSqlByKey(params: {
    request: AssistantOrchestratorRequest;
    sourceKey: string;
  }): Promise<ResolveTemplateSourceSqlByKeyResult> {
    const { request, sourceKey } = params;
    const template = await this.insightTemplateService.getByIdAndDataMartIdAndProjectId(
      request.sessionContext.templateId,
      request.dataMartId,
      request.projectId
    );

    const sources: ResolvedTemplateSource[] = (template.sources ?? []).map(source => ({
      templateSourceId: source.templateSourceId ?? undefined,
      key: source.key,
      artifactId: source.artifactId ?? undefined,
    }));

    const matched = this.resolveSourceByKey(sources, sourceKey);
    if (!matched.matchedSource) {
      throw new NotFoundException(`Template source "${sourceKey}" not found`);
    }

    if (!matched.matchedSource.artifactId) {
      throw new BadRequestException(
        `Template source "${matched.matchedSource.key}" is not linked to an artifact`
      );
    }

    const artifact = await this.insightArtifactService.getByIdAndDataMartIdAndProjectId(
      matched.matchedSource.artifactId,
      request.dataMartId,
      request.projectId
    );

    const sql = (artifact.sql ?? '').trim();
    if (!sql) {
      throw new BadRequestException(
        `Artifact "${artifact.id}" linked to source "${matched.matchedSource.key}" has empty SQL`
      );
    }

    return {
      templateSourceId: matched.matchedSource.templateSourceId,
      sourceKey: matched.matchedSource.key,
      artifactId: artifact.id,
      sql,
    };
  }

  async resolveTemplateSourceSqlByTemplateSourceId(params: {
    request: AssistantOrchestratorRequest;
    templateSourceId: string;
  }): Promise<ResolveTemplateSourceSqlByKeyResult> {
    const { request, templateSourceId } = params;
    const normalizedTemplateSourceId = templateSourceId.trim();

    const source = await this.insightTemplateSourceService.getByIdAndTemplateId(
      normalizedTemplateSourceId,
      request.sessionContext.templateId
    );

    const sql = source.sql();
    if (!sql) {
      throw new BadRequestException(
        `Artifact "${source.artifactId}" linked to source "${source.key}" has empty SQL`
      );
    }

    return {
      templateSourceId: source.id,
      sourceKey: source.key,
      artifactId: source.artifactId,
      sql,
    };
  }

  async resolveArtifactSqlById(params: {
    request: AssistantOrchestratorRequest;
    artifactId: string;
  }): Promise<ResolveArtifactSqlByIdResult> {
    const { request, artifactId } = params;
    const artifact = await this.insightArtifactService.getByIdAndDataMartIdAndProjectId(
      artifactId,
      request.dataMartId,
      request.projectId
    );

    const sql = (artifact.sql ?? '').trim();
    if (!sql) {
      throw new BadRequestException(
        `Artifact "${artifact.id}" has empty SQL and cannot be refined`
      );
    }

    return {
      artifactId: artifact.id,
      sql,
    };
  }

  private async buildResolvedSourceCandidate(
    source: InsightTemplateSource,
    request: AssistantOrchestratorRequest,
    diagnostics: string[]
  ): Promise<ResolvedTemplateSource> {
    if (!source.artifactId) {
      return {
        templateSourceId: source.templateSourceId ?? undefined,
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
        templateSourceId: source.templateSourceId ?? undefined,
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
        templateSourceId: source.templateSourceId ?? undefined,
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
