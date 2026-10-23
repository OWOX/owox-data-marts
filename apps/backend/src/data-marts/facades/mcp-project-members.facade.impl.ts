import { ForbiddenException, Injectable } from '@nestjs/common';
import { satisfiesRole } from '../../idp/utils/role-hierarchy';
import { ListProjectMembersService } from '../use-cases/project-members/list-project-members.service';
import type {
  McpProjectMember,
  McpProjectMembersContext,
  McpProjectMembersFacade,
} from './mcp-project-members.facade';

@Injectable()
export class McpProjectMembersFacadeImpl implements McpProjectMembersFacade {
  constructor(private readonly members: ListProjectMembersService) {}

  async listProjectMembers(ctx: McpProjectMembersContext): Promise<McpProjectMember[]> {
    if (!ctx.userId?.trim() || !ctx.projectId?.trim() || !satisfiesRole(ctx.roles, 'viewer')) {
      throw new ForbiddenException('An authenticated project member is required to list members');
    }
    return this.members.run(ctx.projectId);
  }
}
