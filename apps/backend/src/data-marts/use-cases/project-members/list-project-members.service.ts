import { Injectable } from '@nestjs/common';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';
import { ListProjectMembersCommand } from '../../dto/domain/list-project-members.command';
import { ProjectRole } from '../../enums/project-role.enum';
import { RoleScope } from '../../enums/role-scope.enum';
import { ContextAccessService } from '../../services/context/context-access.service';

export interface ProjectMemberWithScope {
  userId: string;
  email: string;
  displayName: string | undefined;
  avatarUrl: string | undefined;
  role: ProjectRole;
  roleScope: RoleScope;
  contextIds: string[];
}

@Injectable()
export class ListProjectMembersService {
  constructor(
    private readonly idpProjectionsFacade: IdpProjectionsFacade,
    private readonly contextAccessService: ContextAccessService
  ) {}

  async run(command: ListProjectMembersCommand): Promise<ProjectMemberWithScope[]> {
    const { projectId } = command;
    const members = command.failOnLookupError
      ? await this.idpProjectionsFacade.getProjectMembersOrThrow(projectId)
      : await this.idpProjectionsFacade.getProjectMembers(projectId);
    const result: ProjectMemberWithScope[] = [];

    // getRoleScope() can materialize provisioning defaults inside a transaction.
    // Keep this sequential so SQLite does not receive concurrent BEGINs.
    for (const member of members) {
      if (member.isOutbound) continue;
      const roleScope = await this.contextAccessService.getRoleScope(member.userId, projectId);
      const contextIds = await this.contextAccessService.getMemberContextIds(
        member.userId,
        projectId
      );

      result.push({
        userId: member.userId,
        email: member.email,
        displayName: member.displayName,
        avatarUrl: member.avatarUrl,
        role: member.role as ProjectRole,
        roleScope,
        contextIds,
      });
    }

    return result;
  }
}
