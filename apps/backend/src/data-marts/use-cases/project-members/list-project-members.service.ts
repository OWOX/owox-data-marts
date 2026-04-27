import { Injectable } from '@nestjs/common';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';
import { ContextAccessService } from '../../services/context/context-access.service';

export interface ProjectMemberWithScope {
  userId: string;
  email: string;
  displayName: string | undefined;
  avatarUrl: string | undefined;
  role: string;
  roleScope: string;
  contextIds: string[];
}

@Injectable()
export class ListProjectMembersService {
  constructor(
    private readonly idpProjectionsFacade: IdpProjectionsFacade,
    private readonly contextAccessService: ContextAccessService
  ) {}

  async run(projectId: string): Promise<ProjectMemberWithScope[]> {
    const members = await this.idpProjectionsFacade.getProjectMembers(projectId);

    return Promise.all(
      members.map(async member => {
        const [roleScope, contextIds] = await Promise.all([
          this.contextAccessService.getRoleScope(member.userId, projectId),
          this.contextAccessService.getMemberContextIds(member.userId, projectId),
        ]);

        return {
          userId: member.userId,
          email: member.email,
          displayName: member.displayName,
          avatarUrl: member.avatarUrl,
          role: member.role,
          roleScope,
          contextIds,
        };
      })
    );
  }
}
