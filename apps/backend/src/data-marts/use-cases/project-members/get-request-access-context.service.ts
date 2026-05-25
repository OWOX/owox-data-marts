import { Injectable } from '@nestjs/common';
import type { UserProvisioningRequestAccessContext } from '@owox/idp-protocol';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';

@Injectable()
export class GetRequestAccessContextService {
  constructor(private readonly idpProjectionsFacade: IdpProjectionsFacade) {}

  async run(userId: string, projectId: string): Promise<UserProvisioningRequestAccessContext> {
    return this.idpProjectionsFacade.getUserProvisioningRequestAccessContext(userId, projectId);
  }
}
