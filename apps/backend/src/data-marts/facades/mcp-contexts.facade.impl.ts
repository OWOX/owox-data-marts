import { ForbiddenException, Injectable } from '@nestjs/common';
import { satisfiesRole } from '../../idp/utils/role-hierarchy';
import { ContextService } from '../services/context/context.service';
import { SetContextMembersService } from '../use-cases/contexts/set-context-members.service';
import type { ContextDto, ContextImpactDto } from '../dto/domain/context.dto';
import type {
  McpContextsFacade,
  McpContextsContext,
  McpContext,
  McpContextSummary,
} from './mcp-contexts.facade';

@Injectable()
export class McpContextsFacadeImpl implements McpContextsFacade {
  constructor(
    private readonly contexts: ContextService,
    private readonly setContextMembersService: SetContextMembersService
  ) {}

  async createContext(
    ctx: McpContextsContext,
    input: { name: string; description?: string | null }
  ): Promise<ContextDto> {
    this.requireAdmin(ctx);
    return this.contexts.create(ctx.projectId, ctx.userId, input.name, input.description);
  }

  async updateContext(
    ctx: McpContextsContext,
    input: { contextId: string; name: string; description?: string | null }
  ): Promise<ContextDto> {
    this.requireAdmin(ctx);
    return this.contexts.update(input.contextId, ctx.projectId, input.name, input.description);
  }

  async getContextImpact(
    ctx: McpContextsContext,
    input: { contextId: string }
  ): Promise<ContextImpactDto> {
    this.requireAdmin(ctx);
    return this.contexts.getImpact(input.contextId, ctx.projectId);
  }

  async deleteContext(ctx: McpContextsContext, input: { contextId: string }): Promise<void> {
    this.requireAdmin(ctx);
    await this.contexts.delete(input.contextId, ctx.projectId);
  }

  async setContextMembers(
    ctx: McpContextsContext,
    input: { contextId: string; assignedUserIds: string[] }
  ): Promise<{ assignedUserIds: string[]; droppedAdminIds: string[] }> {
    this.requireAdmin(ctx);
    return this.setContextMembersService.run(input.contextId, ctx.projectId, input.assignedUserIds);
  }

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

  private requireAdmin(ctx: McpContextsContext): void {
    if (!ctx.userId?.trim() || !ctx.projectId?.trim() || !satisfiesRole(ctx.roles, 'admin')) {
      throw new ForbiddenException('An authenticated project admin is required to manage Contexts');
    }
  }
}
