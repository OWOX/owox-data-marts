import { Injectable, UnauthorizedException } from '@nestjs/common';
import { IdpProjectionsFacade } from './idp-projections.facade';
import type {
  McpProjectContextFacade,
  McpProjectContextRequest,
  McpProjectContextResponse,
} from './mcp-project-context.facade';

@Injectable()
export class McpProjectContextFacadeImpl implements McpProjectContextFacade {
  constructor(private readonly idpProjectionsFacade: IdpProjectionsFacade) {}

  async getProjectContext(request: McpProjectContextRequest): Promise<McpProjectContextResponse> {
    const project = await this.idpProjectionsFacade.getProjectForUser(
      request.userId,
      request.projectId
    );

    if (project.id !== request.projectId) {
      throw new UnauthorizedException('Current MCP project is not available for user');
    }

    return {
      project: {
        id: project.id,
        title: project.title,
        status: project.status,
        roles: project.roles && project.roles.length > 0 ? project.roles : request.roles,
        createdAt: project.createdAt,
      },
    };
  }
}
