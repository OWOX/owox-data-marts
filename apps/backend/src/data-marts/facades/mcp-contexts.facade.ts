import type { ContextDto, ContextImpactDto } from '../dto/domain/context.dto';

export const MCP_CONTEXTS_FACADE = Symbol('MCP_CONTEXTS_FACADE');

export interface McpContextsContext {
  projectId: string;
  userId: string;
  roles: string[];
}

export interface McpContextSummary {
  id: string;
  name: string;
}
export interface McpContext extends McpContextSummary {
  description: string | null;
}

export interface McpContextsFacade {
  createContext(
    ctx: McpContextsContext,
    input: { name: string; description?: string | null }
  ): Promise<ContextDto>;
  updateContext(
    ctx: McpContextsContext,
    input: { contextId: string; name: string; description?: string | null }
  ): Promise<ContextDto>;
  getContextImpact(
    ctx: McpContextsContext,
    input: { contextId: string }
  ): Promise<ContextImpactDto>;
  deleteContext(ctx: McpContextsContext, input: { contextId: string }): Promise<void>;
  setContextMembers(
    ctx: McpContextsContext,
    input: { contextId: string; assignedUserIds: string[] }
  ): Promise<{ assignedUserIds: string[]; droppedAdminIds: string[] }>;
  listContexts(projectId: string): Promise<McpContext[]>;
  validateContextIds(projectId: string, contextIds: string[]): Promise<void>;
  getDataMartContexts(
    projectId: string,
    dataMartIds: string[]
  ): Promise<Record<string, McpContextSummary[]>>;
}
