import { Injectable } from '@nestjs/common';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';
import { toProjectRole } from '../../mappers/project-members.mapper';
import type { ProjectMembershipRequestDto } from './dto/project-membership-request.dto';

@Injectable()
export class ListMembershipRequestsService {
  constructor(private readonly idpProjectionsFacade: IdpProjectionsFacade) {}

  async run(projectId: string, actorUserId: string): Promise<ProjectMembershipRequestDto[]> {
    const requests = await this.idpProjectionsFacade.listMembershipRequests(projectId, actorUserId);
    return requests.map(r => ({
      requestId: r.requestId,
      email: r.email,
      fullName: r.fullName,
      avatar: r.avatar,
      userId: r.userId,
      requestedRole: toProjectRole(r.requestedRole),
      createdAt: r.createdAt,
    }));
  }
}
