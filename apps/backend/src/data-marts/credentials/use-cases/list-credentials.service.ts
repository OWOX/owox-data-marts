import { Injectable } from '@nestjs/common';
import type { AuthorizationContext } from '../../../idp';
import { AccessDecisionService, Action, EntityType } from '../../services/access-decision';
import type { CredentialDto } from '../dto/credential.dto';
import { CredentialService } from '../services/credential.service';
import { CredentialViewService } from '../services/credential-view.service';

@Injectable()
export class ListCredentialsService {
  constructor(
    private readonly credentials: CredentialService,
    private readonly access: AccessDecisionService,
    private readonly view: CredentialViewService
  ) {}

  async run(context: AuthorizationContext): Promise<CredentialDto[]> {
    const credentials = await this.credentials.listByProjectId(context.projectId);
    const decisions = await this.access.canAccessMany(
      context.userId,
      context.roles ?? [],
      EntityType.CREDENTIAL,
      credentials.map(credential => credential.id),
      Action.SEE,
      context.projectId
    );
    return Promise.all(
      credentials
        .filter(credential => decisions.get(credential.id) === true)
        .map(credential => this.view.build(credential))
    );
  }
}
