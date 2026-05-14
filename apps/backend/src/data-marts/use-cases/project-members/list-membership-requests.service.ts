import { Injectable } from '@nestjs/common';
import type { ProjectMembershipRequest } from '@owox/idp-protocol';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';

@Injectable()
export class ListMembershipRequestsService {
  constructor(private readonly idpProjectionsFacade: IdpProjectionsFacade) {}

  async run(projectId: string, actorUserId: string): Promise<ProjectMembershipRequest[]> {
    return this.idpProjectionsFacade.listMembershipRequests(projectId, actorUserId);
  }
}
