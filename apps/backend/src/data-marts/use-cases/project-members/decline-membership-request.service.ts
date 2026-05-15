import { Injectable, NotFoundException } from '@nestjs/common';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';
import { isIdpNotFoundError } from '../../../idp/utils/is-idp-not-found-error';
import { DeclineMembershipRequestCommand } from '../../dto/domain/decline-membership-request.command';

@Injectable()
export class DeclineMembershipRequestService {
  constructor(private readonly idpProjectionsFacade: IdpProjectionsFacade) {}

  async run(command: DeclineMembershipRequestCommand): Promise<void> {
    const { projectId, actorUserId, requestId } = command;

    try {
      await this.idpProjectionsFacade.declineMembershipRequest(projectId, requestId, actorUserId);
    } catch (err) {
      if (isIdpNotFoundError(err)) {
        throw new NotFoundException(`Membership request "${requestId}" not found`);
      }
      throw err;
    }
  }
}
