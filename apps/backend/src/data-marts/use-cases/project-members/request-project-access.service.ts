import { Injectable } from '@nestjs/common';
import type { RequestProjectAccessResult, Role } from '@owox/idp-protocol';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';

@Injectable()
export class RequestProjectAccessService {
  constructor(private readonly idpProjectionsFacade: IdpProjectionsFacade) {}

  async run(userId: string, projectId: string, role: Role): Promise<RequestProjectAccessResult> {
    return this.idpProjectionsFacade.requestProjectAccess(userId, projectId, role);
  }
}
