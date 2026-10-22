import { Injectable } from '@nestjs/common';
import type { CreateNewProjectResult } from '@owox/idp-protocol';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';
import { ProjectCreationIntegration } from '../../enums/project-creation-integration.enum';

@Injectable()
export class CreateNewProjectService {
  constructor(private readonly idpProjectionsFacade: IdpProjectionsFacade) {}

  async run(
    userId: string,
    integration: ProjectCreationIntegration = ProjectCreationIntegration.OWOX_DATA_MARTS
  ): Promise<CreateNewProjectResult> {
    return this.idpProjectionsFacade.createNewProject(userId, integration);
  }
}
