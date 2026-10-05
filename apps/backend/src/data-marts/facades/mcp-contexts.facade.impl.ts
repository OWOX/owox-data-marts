import { Injectable } from '@nestjs/common';
import { ContextService } from '../services/context/context.service';
import type { McpContextsFacade, McpContext, McpContextSummary } from './mcp-contexts.facade';

@Injectable()
export class McpContextsFacadeImpl implements McpContextsFacade {
  constructor(private readonly contexts: ContextService) {}
  listContexts(projectId: string): Promise<McpContext[]> {
    return this.contexts.listForMcp(projectId);
  }
  validateContextIds(projectId: string, contextIds: string[]): Promise<void> {
    return this.contexts.validateContextIds([...new Set(contextIds)], projectId);
  }
  getDataMartContexts(
    projectId: string,
    dataMartIds: string[]
  ): Promise<Record<string, McpContextSummary[]>> {
    return this.contexts.getDataMartContextSummaries(projectId, dataMartIds);
  }
}
