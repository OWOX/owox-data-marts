import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthorizationContext } from '../../../idp';
import { AccessDecisionService, Action, EntityType } from '../../services/access-decision';
import type { CredentialDto } from '../dto/credential.dto';
import { CredentialService } from '../services/credential.service';
import { CredentialViewService } from '../services/credential-view.service';

@Injectable()
export class GetCredentialService {
  constructor(
    private readonly credentials: CredentialService,
    private readonly access: AccessDecisionService,
    private readonly view: CredentialViewService
  ) {}

  async run(id: string, context: AuthorizationContext): Promise<CredentialDto> {
    const credential = await this.credentials.getByIdAndProjectId(id, context.projectId);
    if (
      !(await this.access.canAccess(
        context.userId,
        context.roles ?? [],
        EntityType.CREDENTIAL,
        id,
        Action.SEE,
        context.projectId
      ))
    ) {
      throw new ForbiddenException('You do not have access to this Credential');
    }
    return this.view.build(credential);
  }
}
