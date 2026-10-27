import { Injectable } from '@nestjs/common';
import { ListProjectMembersCommand } from '../dto/domain/list-project-members.command';
import { ListProjectMembersService } from '../use-cases/project-members/list-project-members.service';
import type { McpProjectMember, McpProjectMembersFacade } from './mcp-project-members.facade';

@Injectable()
export class McpProjectMembersFacadeImpl implements McpProjectMembersFacade {
  constructor(private readonly members: ListProjectMembersService) {}

  async listProjectMembers(projectId: string): Promise<McpProjectMember[]> {
    return this.members.run(new ListProjectMembersCommand(projectId, true));
  }
}
