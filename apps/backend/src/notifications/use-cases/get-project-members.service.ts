import { Injectable } from '@nestjs/common';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import { ProjectMemberApiDto } from '../dto/presentation/project-member-api.dto';

@Injectable()
export class GetProjectMembersService {
  constructor(private readonly idpProjectionsFacade: IdpProjectionsFacade) {}

  async run(projectId: string): Promise<ProjectMemberApiDto[]> {
    const members = await this.idpProjectionsFacade.getProjectMembers(projectId);
    return members.map(m => ({
      userId: m.userId,
      email: m.email,
      displayName: m.displayName,
      avatarUrl: m.avatarUrl,
      role: m.role,
      hasNotificationsEnabled: m.hasNotificationsEnabled,
    }));
  }
}
