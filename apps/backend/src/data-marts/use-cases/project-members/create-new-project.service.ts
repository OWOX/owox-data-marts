import { Injectable } from '@nestjs/common';
import type { CreateNewProjectResult } from '@owox/idp-protocol';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';

const ODM_SIGN_IN_INTEGRATION = 'extension-v2';

@Injectable()
export class CreateNewProjectService {
  constructor(private readonly idpProjectionsFacade: IdpProjectionsFacade) {}

  async run(userId: string): Promise<CreateNewProjectResult> {
    return this.idpProjectionsFacade.createNewProject(userId, ODM_SIGN_IN_INTEGRATION);
  }
}
