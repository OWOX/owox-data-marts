import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Role } from '@owox/idp-protocol';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';

export type SetupOperation = 'stored-read' | 'mutation' | 'live';

export interface SetupActor {
  projectId: string;
  userId: string;
  roles: Role[];
}

@Injectable()
export class SetupAuthorizationService {
  constructor(private readonly idpProjections: IdpProjectionsFacade) {}

  async authorize(context: McpAuthContext, operation: SetupOperation): Promise<SetupActor> {
    if (!context.userId?.trim() || !context.projectId?.trim()) {
      throw new UnauthorizedException('Setup requires a project and user');
    }

    if (
      !context.scopes?.includes('mcp:read') ||
      (operation !== 'stored-read' && !context.scopes.includes('mcp:write'))
    ) {
      throw new ForbiddenException('Insufficient MCP scopes for setup operation');
    }

    const project = await this.idpProjections.getProjectForUser(context.userId, context.projectId);
    if (
      project.id !== context.projectId ||
      (project.status !== undefined && project.status !== 'active') ||
      !project.roles?.some(role => role === 'admin' || role === 'editor')
    ) {
      throw new ForbiddenException('Setup requires current project editor or admin access');
    }

    return { projectId: context.projectId, userId: context.userId, roles: [...project.roles] };
  }
}
