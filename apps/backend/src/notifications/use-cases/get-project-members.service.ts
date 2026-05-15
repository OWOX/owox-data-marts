import { Injectable } from '@nestjs/common';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import { TenantGuardService } from '../../idp/services/tenant-guard.service';
import { ProjectMemberApiDto } from '../dto/presentation/project-member-api.dto';

@Injectable()
export class GetProjectMembersService {
  constructor(
    private readonly idpProjectionsFacade: IdpProjectionsFacade,
    private readonly tenantGuard: TenantGuardService
  ) {}

  async run(projectId: string): Promise<ProjectMemberApiDto[]> {
    this.tenantGuard.assertProject(projectId);
    const members = await this.idpProjectionsFacade.getProjectMembers(projectId);
    return members.map(m => ({
      userId: m.userId,
      email: m.email,
      displayName: m.displayName,
      avatarUrl: m.avatarUrl,
      role: m.role,
      hasNotificationsEnabled: m.hasNotificationsEnabled,
      isOutbound: m.isOutbound,
    }));
  }
}
