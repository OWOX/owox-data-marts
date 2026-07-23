import type { McpProjectContextFacade } from '../../../idp/facades/mcp-project-context.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';

export interface McpProjectSummary {
  id: string;
  title: string;
}

/**
 * Project title is supplemental metadata for catalog discovery. The primary catalog result stays
 * useful when that enrichment is temporarily unavailable.
 */
export async function tryGetMcpProjectSummary(
  projectContext: McpProjectContextFacade,
  context: McpAuthContext
): Promise<McpProjectSummary | undefined> {
  try {
    const result = await projectContext.getProjectContext({
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles,
    });
    return { id: result.project.id, title: result.project.title };
  } catch {
    return undefined;
  }
}
