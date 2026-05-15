import { Injectable, Logger } from '@nestjs/common';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';
import { isIdpNotFoundError } from '../../../idp/utils/is-idp-not-found-error';
import { DeclineMembershipRequestCommand } from '../../dto/domain/decline-membership-request.command';

@Injectable()
export class DeclineMembershipRequestService {
  private readonly logger = new Logger(DeclineMembershipRequestService.name);

  constructor(private readonly idpProjectionsFacade: IdpProjectionsFacade) {}

  async run(command: DeclineMembershipRequestCommand): Promise<void> {
    try {
      await this.idpProjectionsFacade.declineMembershipRequest(
        command.projectId,
        command.requestId,
        command.actorUserId
      );
    } catch (err) {
      if (isIdpNotFoundError(err)) {
        this.logger.debug(
          `Decline request ${command.requestId} in project ${command.projectId}: already gone upstream — treating as success.`
        );
        return;
      }
      throw err;
    }
  }
}
