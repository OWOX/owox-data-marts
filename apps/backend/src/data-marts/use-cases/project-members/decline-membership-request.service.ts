import { Injectable } from '@nestjs/common';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';
import { DeclineMembershipRequestCommand } from '../../dto/domain/decline-membership-request.command';

@Injectable()
export class DeclineMembershipRequestService {
  constructor(private readonly idpProjectionsFacade: IdpProjectionsFacade) {}

  async run(command: DeclineMembershipRequestCommand): Promise<void> {
    await this.idpProjectionsFacade.declineMembershipRequest(
      command.projectId,
      command.requestId,
      command.actorUserId,
      command.reason
    );
  }
}
