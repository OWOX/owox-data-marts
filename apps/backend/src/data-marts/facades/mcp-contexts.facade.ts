import type { ContextDto, ContextImpactDto } from '../dto/domain/context.dto';
import type { DataMartIconValue } from '../enums/data-mart-icon.enum';

export { DataMartIcon, DATA_MART_ICON_MAX_LENGTH } from '../enums/data-mart-icon.enum';

export const MCP_CONTEXTS_FACADE = Symbol('MCP_CONTEXTS_FACADE');

export interface McpProjectActor {
  projectId: string;
  userId: string;
}

export interface McpContextSummary {
  id: string;
  name: string;
}
export interface McpContext extends McpContextSummary {
  description: string | null;
  icon: DataMartIconValue | null;
}

export interface McpContextsFacade {
  createContext(
    actor: McpProjectActor,
    input: { name: string; description?: string | null; icon?: DataMartIconValue | null }
  ): Promise<ContextDto>;
  updateContextMetadata(
    actor: McpProjectActor,
    input: {
      contextId: string;
      name?: string;
      description?: string | null;
      icon?: DataMartIconValue | null;
    }
  ): Promise<ContextDto>;
  getContextImpact(actor: McpProjectActor, input: { contextId: string }): Promise<ContextImpactDto>;
  deleteContext(actor: McpProjectActor, input: { contextId: string }): Promise<void>;
  setContextMembers(
    actor: McpProjectActor,
    input: { contextId: string; assignedUserIds: string[] }
  ): Promise<{ assignedUserIds: string[]; droppedAdminIds: string[] }>;
  listContexts(projectId: string): Promise<McpContext[]>;
  validateContextIds(projectId: string, contextIds: string[]): Promise<void>;
  getDataMartContexts(
    projectId: string,
    dataMartIds: string[]
  ): Promise<Record<string, McpContextSummary[]>>;
}
