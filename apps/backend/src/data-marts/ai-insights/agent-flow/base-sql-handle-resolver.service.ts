import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AgentFlowRequest } from './types';
import { AiAssistantSessionService } from '../../services/ai-assistant-session.service';
import { SourceResolverToolsService } from './source-resolver-tools.service';

export const BASE_SQL_HANDLE_KINDS = ['rev', 'src', 'art'] as const;
export type BaseSqlHandleKind = (typeof BASE_SQL_HANDLE_KINDS)[number];

export interface ResolvedBaseSqlFromHandle {
  baseSql: string;
  baseAssistantMessageId?: string;
  origin: { type: 'handle'; handle: string; kind: BaseSqlHandleKind };
}

@Injectable()
export class BaseSqlHandleResolverService {
  private readonly logger = new Logger(BaseSqlHandleResolverService.name);

  constructor(
    private readonly aiAssistantSessionService: AiAssistantSessionService,
    private readonly sourceResolverToolsService: SourceResolverToolsService
  ) {}

  async resolve(rawHandle: string, request: AgentFlowRequest): Promise<ResolvedBaseSqlFromHandle> {
    const raw = rawHandle.trim();
    const [prefix, ...rest] = raw.split(':');
    const hasKnownPrefix =
      rest.length > 0 && (BASE_SQL_HANDLE_KINDS as readonly string[]).includes(prefix);
    const value = (rest.length > 0 ? rest.join(':') : raw).trim();
    const id = value || raw;

    const resolverOrder: BaseSqlHandleKind[] = hasKnownPrefix
      ? [
          prefix as BaseSqlHandleKind,
          ...BASE_SQL_HANDLE_KINDS.filter(kind => kind !== (prefix as BaseSqlHandleKind)),
        ]
      : [...BASE_SQL_HANDLE_KINDS];

    const handlers: Record<BaseSqlHandleKind, () => Promise<ResolvedBaseSqlFromHandle | null>> = {
      rev: () => this.tryResolveRevBaseSqlHandle({ raw, id, request }),
      src: () => this.tryResolveSrcBaseSqlHandle({ raw, id, request }),
      art: () => this.tryResolveArtBaseSqlHandle({ raw, id, request }),
    };

    for (const kind of resolverOrder) {
      const resolved = await handlers[kind]();
      if (resolved) {
        return resolved;
      }
    }

    throw new BadRequestException(`Unable to resolve SQL for baseSqlHandle "${rawHandle}"`);
  }

  private async tryResolveRevBaseSqlHandle(params: {
    raw: string;
    id: string;
    request: AgentFlowRequest;
  }): Promise<ResolvedBaseSqlFromHandle | null> {
    const { raw, id, request } = params;

    try {
      const resolved = await this.resolveBaseSqlFromRevisionId(
        request.sessionContext.sessionId,
        id
      );
      return {
        ...resolved,
        origin: { type: 'handle', handle: raw, kind: 'rev' },
      };
    } catch (error) {
      this.logger.log('BaseSqlHandleResolver: handle candidate resolve miss', {
        kind: 'rev',
        handle: raw,
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async tryResolveSrcBaseSqlHandle(params: {
    raw: string;
    id: string;
    request: AgentFlowRequest;
  }): Promise<ResolvedBaseSqlFromHandle | null> {
    const { raw, id, request } = params;

    try {
      const resolved =
        await this.sourceResolverToolsService.resolveTemplateSourceSqlByTemplateSourceId({
          request,
          templateSourceId: id,
        });
      return {
        baseSql: resolved.sql,
        origin: { type: 'handle', handle: raw, kind: 'src' },
      };
    } catch (error) {
      this.logger.log('BaseSqlHandleResolver: handle candidate resolve miss', {
        kind: 'src',
        handle: raw,
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async tryResolveArtBaseSqlHandle(params: {
    raw: string;
    id: string;
    request: AgentFlowRequest;
  }): Promise<ResolvedBaseSqlFromHandle | null> {
    const { raw, id, request } = params;

    try {
      const resolved = await this.sourceResolverToolsService.resolveArtifactSqlById({
        request,
        artifactId: id,
      });
      return {
        baseSql: resolved.sql,
        origin: { type: 'handle', handle: raw, kind: 'art' },
      };
    } catch (error) {
      this.logger.log('BaseSqlHandleResolver: handle candidate resolve miss', {
        kind: 'art',
        handle: raw,
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async resolveBaseSqlFromRevisionId(
    sessionId: string,
    assistantMessageId: string
  ): Promise<{
    baseAssistantMessageId: string;
    baseSql: string;
  }> {
    const baseMessage = await this.aiAssistantSessionService.getAssistantMessageByIdAndSessionId(
      assistantMessageId,
      sessionId
    );
    const baseSql =
      typeof baseMessage.sqlCandidate === 'string' ? baseMessage.sqlCandidate.trim() : '';

    if (!baseSql) {
      throw new BadRequestException(
        `SQL revision "${assistantMessageId}" has empty sqlCandidate and cannot be refined`
      );
    }

    return {
      baseAssistantMessageId: baseMessage.id,
      baseSql,
    };
  }
}
