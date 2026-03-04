import { BadRequestException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InsightTemplateSource } from '../../dto/schemas/insight-template/insight-template-source.schema';
import { InsightArtifactService } from '../../services/insight-artifact.service';
import { InsightTemplateService } from '../../services/insight-template.service';
import { InsightTemplateSourceService } from '../../services/insight-template-source.service';
import { AssistantOrchestratorRequest } from './ai-assistant-types';

export interface ResolvedTemplateSource {
  templateSourceId: string;
  key: string;
  sourceTitle?: string;
  sql?: string;
}

export interface ListTemplateSourcesResult {
  sources: ResolvedTemplateSource[];
  diagnostics: string[];
}

export interface ResolveSourceByKeyResult {
  matchedSource?: ResolvedTemplateSource;
  confidence: number;
  reason: string;
}

export interface ResolveTemplateSourceSqlByKeyResult {
  templateSourceId: string;
  sourceKey: string;
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

    const sources = (template.sources ?? []).map(source => ({
      templateSourceId: source.templateSourceId,
      key: source.key,
    }));

    const matched = this.resolveSourceByKey(sources, sourceKey);
    if (!matched.matchedSource) {
      throw new NotFoundException(`Template source "${sourceKey}" not found`);
    }
    const matchedSource = matched.matchedSource;

    const matchedTemplateSource = (template.sources ?? []).find(
      source => source.templateSourceId === matchedSource.templateSourceId
    );
    if (!matchedTemplateSource?.artifactId) {
      throw new BadRequestException(`Template source "${matchedSource.key}" has no SQL link`);
    }

    const artifact = await this.insightArtifactService.getByIdAndDataMartIdAndProjectId(
      matchedTemplateSource.artifactId,
      request.dataMartId,
      request.projectId
    );

    const sql = (artifact.sql ?? '').trim();
    if (!sql) {
      throw new BadRequestException(
        `Artifact "${artifact.id}" linked to source "${matchedSource.key}" has empty SQL`
      );
    }

    return {
      templateSourceId: matchedSource.templateSourceId,
      sourceKey: matchedSource.key,
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
        templateSourceId: source.templateSourceId,
        key: source.key,
        sourceTitle: undefined,
        sql: undefined,
      };
    }

    try {
      const artifact = await this.insightArtifactService.getByIdAndDataMartIdAndProjectId(
        source.artifactId,
        request.dataMartId,
        request.projectId
      );

      return {
        templateSourceId: source.templateSourceId,
        key: source.key,
        sourceTitle: artifact.title ?? undefined,
        sql: this.normalizeSql(artifact.sql),
      };
    } catch (error: unknown) {
      diagnostics.push(`Source "${source.key}" SQL source is unavailable for matching.`);
      this.logger.warn('Failed to load source artifact while building resolver candidates', {
        sourceKey: source.key,
        artifactId: source.artifactId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        templateSourceId: source.templateSourceId,
        key: source.key,
        sourceTitle: undefined,
        sql: undefined,
      };
    }
  }

  private normalizeSql(sql: string | null | undefined): string | undefined {
    const normalized = (sql ?? '').trim();
    if (!normalized) {
      return undefined;
    }

    return normalized;
  }

  private normalizeIdentifier(value: string | null | undefined): string {
    return (value ?? '')
      .toLowerCase()
      .replace(/[`"'“”‘’]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }
}
