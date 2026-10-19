import type {
  ContextChange,
  ContextMutation,
  ContextMutationResult,
  ContextChangeImpact,
} from '../dto/domain/context-mutation.dto';
import type {
  ContextDefaultsDto,
  ContextResourceDto,
  ContextResourceQuery,
  ContextSetupActor,
  ContextSetupDto,
  ContextSetupImpactDto,
  ContextSetupMemberDto,
} from '../dto/domain/mcp-context-setup.dto';

export const MCP_CONTEXT_SETUP_FACADE = Symbol('MCP_CONTEXT_SETUP_FACADE');

export interface McpContextSetupFacade {
  mutate(actor: ContextSetupActor, command: ContextMutation): Promise<ContextMutationResult>;
  getChangeImpact(actor: ContextSetupActor, change: ContextChange): Promise<ContextChangeImpact>;
  getContext(actor: ContextSetupActor, contextId: string): Promise<ContextSetupDto>;
  listResources(
    actor: ContextSetupActor,
    query: ContextResourceQuery
  ): Promise<ContextResourceDto[]>;
  listMembers(
    actor: ContextSetupActor,
    query: { query?: string; limit: number; offset: number }
  ): Promise<ContextSetupMemberDto[]>;
  getDefaults(actor: ContextSetupActor): Promise<ContextDefaultsDto>;
  getImpact(actor: ContextSetupActor, contextId: string): Promise<ContextSetupImpactDto>;
}
